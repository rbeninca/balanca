package br.edu.ifsc.balancagfig

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import br.edu.ifsc.balancagfig.processamento.ConfiguracaoPipeline
import br.edu.ifsc.balancagfig.processamento.PipelineProcessamento
import br.edu.ifsc.balancagfig.protocolo.Codificador
import br.edu.ifsc.balancagfig.protocolo.ComandoHost
import br.edu.ifsc.balancagfig.protocolo.ComandoObterConfig
import br.edu.ifsc.balancagfig.protocolo.PacoteConfiguracao
import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import br.edu.ifsc.balancagfig.protocolo.PacoteESP
import br.edu.ifsc.balancagfig.protocolo.PacoteStatus
import br.edu.ifsc.balancagfig.serial.PortaSerialUsb
import br.edu.ifsc.balancagfig.armazenamento.BancoDados
import br.edu.ifsc.balancagfig.armazenamento.BackupPendrive
import br.edu.ifsc.balancagfig.armazenamento.EscritaSessoes
import br.edu.ifsc.balancagfig.armazenamento.GravadorSessao
import br.edu.ifsc.balancagfig.atualizacao.ArmazemPreferencias
import br.edu.ifsc.balancagfig.atualizacao.Atualizador
import br.edu.ifsc.balancagfig.atualizacao.InstaladorRoot
import br.edu.ifsc.balancagfig.atualizacao.RedeHttp
import br.edu.ifsc.balancagfig.atualizacao.Versao
import br.edu.ifsc.balancagfig.firmware.GravadorEsp8266
import br.edu.ifsc.balancagfig.servidor.ServidorAtualizador
import br.edu.ifsc.balancagfig.servidor.Mensagens
import br.edu.ifsc.balancagfig.servidor.ServidorApi
import br.edu.ifsc.balancagfig.servidor.ServidorHttp
import br.edu.ifsc.balancagfig.servidor.ServidorSaude
import br.edu.ifsc.balancagfig.servidor.ServidorWs
import br.edu.ifsc.balancagfig.sistema.EnderecosRede
import br.edu.ifsc.balancagfig.sistema.HotspotManager
import br.edu.ifsc.balancagfig.sistema.RedirecionamentoPorta
import br.edu.ifsc.balancagfig.sistema.SerialDoBox
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.atomic.AtomicLong

/**
 * Serviço em primeiro plano que mantém a balança no ar enquanto o box estiver
 * ligado: porta serial USB → pipeline → WebSocket, servidor do frontend,
 * health-check e hotspot. Substitui os containers gateway + webapp do
 * Cenário A (a api REST entra na próxima fase).
 */
class ServicoBalanca : Service() {

    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var wakeLock: PowerManager.WakeLock? = null

    private var porta: PortaSerialUsb? = null
    private var http: ServidorHttp? = null
    private var ws: ServidorWs? = null
    private var saude: ServidorSaude? = null
    private var api: ServidorApi? = null
    private var atualizador: ServidorAtualizador? = null
    private var bd: BancoDados? = null
    private var backup: BackupPendrive? = null
    private var atualizadorApp: Atualizador? = null
    private var gravador: GravadorSessao? = null
    /** Última configuração recebida da ESP: reenviada a quem (re)conecta, sem nova consulta à ESP. */
    @Volatile private var ultimaConfig: PacoteConfiguracao? = null
    private val inicioMs = System.currentTimeMillis()
    private var destinoGravacao: EscritaSessoes.DestinoBanco? = null

    /** Mesmos padrões do gateway Node (variáveis de ambiente do principal.ts). */
    private val pipeline = PipelineProcessamento(ConfiguracaoPipeline())

    private val pacotesNoIntervalo = AtomicLong(0)

    /** Reage a inserir/remover pendrive USB para (re)fazer o backup. */
    private val receptorMidia = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            when (i?.action) {
                Intent.ACTION_MEDIA_MOUNTED -> backup?.sincronizarTudo()
                Intent.ACTION_MEDIA_UNMOUNTED, Intent.ACTION_MEDIA_EJECT ->
                    EstadoHost.definirPendrive(null)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instancia = this
        startForeground(ID_NOTIFICACAO, montarNotificacao("Iniciando…"))

        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG:servico")
            .also { it.acquire() }

        iniciarHttp()
        iniciarWebSocket()
        iniciarAtualizacaoApp()
        iniciarApi()
        iniciarAtualizador()
        iniciarSerial()
        iniciarHotspot()
        iniciarContadorTaxa()
        iniciarBatimento()

        EstadoHost.definirServicoAtivo(true)
        EstadoHost.registrar("Serviço iniciado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Reconecta quando a Activity é lançada pelo evento USB_DEVICE_ATTACHED
        if (intent?.getBooleanExtra(EXTRA_RECONECTAR_USB, false) == true) porta?.conectar()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        EstadoHost.definirServicoAtivo(false)
        EstadoHost.registrar("Serviço encerrado")
        porta?.parar()
        ws?.encerrar()
        saude?.stop()
        api?.stop()
        gravador?.parar("serviço encerrado")
        destinoGravacao?.encerrar()
        atualizador?.stop()
        try { unregisterReceiver(receptorMidia) } catch (_: Exception) { }
        bd?.close()
        RedirecionamentoPorta.remover()
        http?.stop()
        EstadoHost.definirPortaHttp(null)
        escopo.cancel()
        wakeLock?.takeIf { it.isHeld }?.release()
        instancia = null
        super.onDestroy()
    }

    // ─── Componentes ────────────────────────────────────────────────────────

    private fun iniciarHttp() {
        try {
            val servidor = ServidorHttp(assets)
            if (!servidor.frontendDisponivel()) {
                EstadoHost.registrar("APK sem frontend embutido (rode copiarFrontend)")
            }
            servidor.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
            http = servidor
            EstadoHost.definirPortaHttp(servidor.listeningPort)
            EstadoHost.registrar("Frontend em http://0.0.0.0:${servidor.listeningPort}")
            aplicarRedirecionamento80(servidor.listeningPort, forcar = true)
            iniciarReconciliacaoRede()
        } catch (e: IOException) {
            Log.e(TAG, "servidor HTTP não subiu", e)
            EstadoHost.registrar("Servidor HTTP falhou: ${e.message}")
        }
    }

    private fun iniciarWebSocket() {
        try {
            ws = ServidorWs(
                estadoInicial = {
                    listOfNotNull(
                        mensagemSaude(),
                        Mensagens.pipelineEstado(pipeline.obterConfig()),
                        gravador?.let { Mensagens.gravacaoEstado(it.estado, ws?.listarClientes() ?: emptyList()) },
                        ultimaConfig?.let { Mensagens.config(it) },
                        if (porta?.conectado == true) Mensagens.serialOk() else Mensagens.serialOff(),
                    )
                },
                aoReceber = ::tratarMensagemCliente,
                aoMudarClientes = { difundirGravacao() },
            ).also { it.iniciar() }
            EstadoHost.registrar("WebSocket em :${ServidorWs.PORTA_PADRAO}")
        } catch (e: IOException) {
            Log.e(TAG, "WebSocket não subiu", e)
            EstadoHost.registrar("WebSocket falhou: ${e.message}")
        }
        try {
            saude = ServidorSaude {
                JSONObject()
                    .put("status", "ok")
                    .put("serial", porta?.conectado == true)
                    .put("clientes", ws?.numClientes ?: 0)
            }.also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
        } catch (e: IOException) {
            Log.e(TAG, "/saude não subiu", e)
        }
    }

    /**
     * API REST + SQLite em filesDir/balanca.db. A chave de API é opcional: se o
     * arquivo filesDir/.chave-api existir, a escrita exige x-chave-api (mesma
     * convenção de CAMINHO_CHAVE_API do pacote api); sem ele, acesso livre.
     */
    private fun iniciarApi() {
        try {
            val banco = BancoDados(this).also { bd = it }
            val bkp = BackupPendrive(this, banco).also { backup = it }
            // Gravação compartilhada no gateway (ver GravadorSessao); alimentada em aoReceber da serial
            val destino = EscritaSessoes.DestinoBanco(banco) { bkp.aoSalvarSessao(it) }.also { destinoGravacao = it }
            gravador = GravadorSessao(
                destino,
                aoMudar = { e ->
                    pipeline.definirGravando(e.gravando)   // zero tracking não corrige durante a gravação
                    difundirGravacao()
                },
                // Fotografia da configuração no início da gravação: os mesmos JSONs que o frontend recebe
                configAtual = {
                    val pipelineJson = JSONObject(Mensagens.pipelineEstado(pipeline.obterConfig())).getJSONObject("carga").toString()
                    val espJson = ultimaConfig?.let { JSONObject(Mensagens.config(it)).getJSONObject("carga").toString() }
                    pipelineJson to espJson
                },
            )
            iniciarContadorGravacao()
            val chave = File(filesDir, ARQUIVO_CHAVE_API).takeIf { it.isFile }?.readText()?.trim()?.ifEmpty { null }
            api = ServidorApi(banco, chave, aoSalvarSessao = { bkp.aoSalvarSessao(it) }, backup = bkp,
                serial = serialDoBox,
                versao = versaoInstalada() ?: "",
                atualizacao = atualizadorApp?.let { a -> ServidorApi.Atualizacao(a) { escopo.launch(Dispatchers.IO) { a.executarPendente() } } })
                .also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
            registrarReceptorMidia()
            bkp.sincronizarTudo()   // o pendrive pode já estar montado no boot
            EstadoHost.registrar("API em :${ServidorApi.PORTA_PADRAO} (${if (chave != null) "com chave" else "sem chave"})")
        } catch (e: Exception) {
            Log.e(TAG, "API não subiu", e)
            EstadoHost.registrar("API falhou: ${e.message}")
        }
    }

    /**
     * Atualização automática do app pelas releases do GitHub: retoma uma cadeia
     * interrompida pela reinstalação e verifica versões novas ao subir e a cada 6 h.
     */
    /**
     * Versão realmente instalada, lida do `PackageManager`.
     *
     * Não usar `BuildConfig.VERSION_NAME` para isto: é constante gravada na
     * compilação, e um build incremental que não regenere o BuildConfig deixa o
     * APK com manifesto novo e constante velha. Um box ficou assim — anunciava
     * 2.8.0 no /saude estando na 2.8.2 — e o inventário, que lê o /saude, não
     * tem como desconfiar.
     */
    private fun versaoInstalada(): String? =
        try {
            packageManager.getPackageInfo(packageName, 0).versionName
        } catch (e: Exception) {
            Log.w(TAG, "não foi possível ler a versão instalada", e)
            null
        }

    private fun iniciarAtualizacaoApp() {
        val versao = versaoInstalada()?.let { Versao.analisar(it) }
        if (versao == null) { EstadoHost.registrar("Atualização: versionName inválido, atualizador desligado"); return }
        val urlReleases = File(filesDir, ARQUIVO_URL_RELEASES).takeIf { it.isFile }?.readText()?.trim()?.ifEmpty { null }
            ?: Atualizador.URL_RELEASES_PADRAO
        val a = Atualizador(
            versaoInstalada = versao,
            rede = RedeHttp("BalancaGFIG/$versao (TVBox)"),
            instalador = InstaladorRoot(),
            armazem = ArmazemPreferencias(this),
            pastaDownload = File(filesDir, "atualizacao"),
            urlReleases = urlReleases,
            registrar = EstadoHost::registrar,
        ).also { atualizadorApp = it }
        escopo.launch(Dispatchers.IO) {
            if (a.retomar()) a.executarPendente()
            // Verificação periódica: só consulta, a instalação depende do usuário.
            delay(30_000)
            while (true) {
                a.verificar()
                delay(6 * 60 * 60 * 1000L)
            }
        }
    }

    /** Atualizador de firmware em :8767 — grava o firmware.bin embutido no APK pela porta da balança. */
    private fun iniciarAtualizador() {
        try {
            atualizador = ServidorAtualizador(
                versaoJson = { lerAsset("web/firmware-versao.json") },
                gravar = ::gravarFirmware,
            ).also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
            EstadoHost.registrar("Atualizador em :${ServidorAtualizador.PORTA_PADRAO}")
        } catch (e: IOException) {
            Log.e(TAG, "atualizador não subiu", e)
            EstadoHost.registrar("Atualizador falhou: ${e.message}")
        }
    }

    private fun gravarFirmware(log: (String) -> Unit) {
        val p = porta ?: throw IOException("Porta serial não iniciada")
        val imagem = assets.open("web/firmware.bin").use { it.readBytes() }
        val stub = lerAsset("firmware/stub_esp8266.json") ?: throw IOException("Stub flasher ausente no APK")
        val registrar = { txt: String -> log(txt); EstadoHost.registrar("FW: $txt") }

        registrar("Pausando leituras da balança...")
        ws?.difundir(Mensagens.serialOff())
        p.usarExclusivo { canal ->
            GravadorEsp8266(canal, stub, registrar).gravar(imagem)
        }
        registrar("Firmware gravado. Aguardando o ESP reiniciar (5 s)...")
        Thread.sleep(5000)
        registrar("Leituras retomadas.")
    }

    private fun registrarReceptorMidia() {
        val filtro = IntentFilter().apply {
            addAction(Intent.ACTION_MEDIA_MOUNTED)
            addAction(Intent.ACTION_MEDIA_UNMOUNTED)
            addAction(Intent.ACTION_MEDIA_EJECT)
            addDataScheme("file")
        }
        registerReceiver(receptorMidia, filtro)
    }

    private fun lerAsset(caminho: String): String? = try {
        assets.open(caminho).bufferedReader().use { it.readText() }
    } catch (_: IOException) {
        null
    }

    /** Mensagens vindas do frontend: config do pipeline fica aqui, comandos vão para o ESP. */
    private fun tratarMensagemCliente(entrada: Mensagens.Entrada, remetente: String) {
        when (entrada) {
            is Mensagens.Entrada.ConfigPipeline -> {
                Log.d(TAG, "PIPELINE_CONFIG de $remetente: ${entrada.patch}")
                pipeline.atualizarConfig(entrada.patch)
                ws?.difundir(Mensagens.pipelineEstado(pipeline.obterConfig()))
            }
            is Mensagens.Entrada.Comando -> enviarAoEsp(entrada.comando)
            is Mensagens.Entrada.GravacaoIniciar -> {
                val g = gravador ?: return
                if (g.iniciar(entrada.nome, remetente)) EstadoHost.registrar("Gravação iniciada por $remetente: ${g.estado.nome}")
                else difundirGravacao()   // já havia gravação: reenvia o estado para quem pediu
            }
            Mensagens.Entrada.GravacaoParar -> {
                val g = gravador ?: return
                val fim = g.parar(remetente)
                if (fim != null) EstadoHost.registrar("Gravação parada por $remetente: ${fim.nome} (${fim.amostras} amostras)")
                else difundirGravacao()
            }
        }
    }

    private fun difundirGravacao() {
        val g = gravador ?: return
        ws?.difundir(Mensagens.gravacaoEstado(g.estado, ws?.listarClientes() ?: emptyList()))
    }

    /** Enquanto grava, difunde o contador de amostras 1× por segundo para os clientes. */
    private fun iniciarContadorGravacao() = escopo.launch {
        while (true) {
            delay(1000)
            if (gravador?.estado?.gravando == true) difundirGravacao()
        }
    }

    /**
     * Identificador deste box, calculado uma vez.
     *
     * `SerialDoBox.ler` consulta o serial fixado à mão por root, e o SAUDE sai a
     * cada 2 s — chamar ali dentro seria um `su` a cada 2 segundos. O valor não
     * muda durante a vida do serviço, então `by lazy` resolve.
     */
    private val serialDoBox: String by lazy { SerialDoBox.ler(this) }

    private fun mensagemSaude(): String {
        val serial = when (EstadoHost.serial.value) {
            is EstadoSerial.Conectado, EstadoSerial.Gravando -> Mensagens.SerialSaude.CONECTADA
            is EstadoSerial.Erro -> Mensagens.SerialSaude.ERRO
            else -> Mensagens.SerialSaude.SEM_DISPOSITIVO
        }
        return Mensagens.saude(
            serial, EstadoHost.estatisticas.value.taxaHz,
            (System.currentTimeMillis() - inicioMs) / 1000, ws?.numClientes ?: 0,
            EnderecosRede.porInterface(),
            serialDoBox,
        )
    }

    /** Batimento SAUDE a cada 2 s (ver Mensagens.saude); aproveita para publicar o offset do zero tracking. */
    private fun iniciarBatimento() = escopo.launch {
        while (true) {
            delay(Mensagens.INTERVALO_SAUDE_MS)
            ws?.difundir(mensagemSaude())
            if (pipeline.consumirMudancaOffset()) ws?.difundir(Mensagens.pipelineEstado(pipeline.obterConfig()))
        }
    }

    private fun enviarAoEsp(comando: ComandoHost) {
        try {
            porta?.enviar(Codificador.codificar(comando))
            EstadoHost.registrar("→ ESP: $comando")
        } catch (e: IOException) {
            EstadoHost.registrar("Comando $comando falhou: ${e.message}")
        }
    }

    private fun iniciarSerial() {
        porta = PortaSerialUsb(this, ouvinte = object : PortaSerialUsb.Ouvinte {
            override fun aoMudarEstado(estado: PortaSerialUsb.Estado) {
                val e = when (estado) {
                    PortaSerialUsb.Estado.SemDispositivo -> EstadoSerial.SemDispositivo
                    is PortaSerialUsb.Estado.SemPermissao -> EstadoSerial.SemPermissao(estado.dispositivo.deviceName)
                    is PortaSerialUsb.Estado.Conectando -> EstadoSerial.Conectando(estado.dispositivo.deviceName)
                    is PortaSerialUsb.Estado.Conectado -> EstadoSerial.Conectado(estado.dispositivo.deviceName, BAUD)
                    is PortaSerialUsb.Estado.Erro -> EstadoSerial.Erro(estado.mensagem)
                    PortaSerialUsb.Estado.Gravando -> EstadoSerial.Gravando
                }
                EstadoHost.definirSerial(e)
                EstadoHost.registrar("Serial: $e")
                atualizarNotificacao()

                when (e) {
                    is EstadoSerial.Conectado -> {
                        ws?.difundir(Mensagens.serialOk())
                        // Como o gateway Node: pede a configuração atual ao ESP ao conectar
                        enviarAoEsp(ComandoObterConfig)
                    }
                    EstadoSerial.SemDispositivo, is EstadoSerial.Erro -> ws?.difundir(Mensagens.serialOff())
                    else -> Unit
                }
            }

            override fun aoReceber(pacote: PacoteESP) {
                when (pacote) {
                    is PacoteDados -> {
                        pacotesNoIntervalo.incrementAndGet()
                        val leitura = pipeline.processar(pacote)
                        EstadoHost.atualizarEstatisticas { it.copy(pacotes = it.pacotes + 1, ultimo = pacote) }
                        gravador?.receber(leitura)
                        ws?.difundir(Mensagens.leitura(leitura))
                        // Fs estimada mudou (filtros IIR reconstruídos): os painéis mostram a nova taxa
                        if (pipeline.consumirMudancaTaxa()) ws?.difundir(Mensagens.pipelineEstado(pipeline.obterConfig()))
                    }
                    is PacoteConfiguracao -> {
                        EstadoHost.registrar("ESP: $pacote")
                        ultimaConfig = pacote
                        ws?.difundir(Mensagens.config(pacote))
                    }
                    is PacoteStatus -> {
                        EstadoHost.registrar("ESP: $pacote")
                        ws?.difundir(Mensagens.status(pacote))
                    }
                }
            }

            override fun aoFalharDecodificacao(motivo: String) {
                EstadoHost.atualizarEstatisticas { it.copy(errosCrc = it.errosCrc + 1) }
                Log.w(TAG, "decodificação: $motivo")
                // Pacotes que não são DADOS são raros — vale mostrar no painel
                if (!motivo.startsWith("tipo 0x1 ")) EstadoHost.registrar("Descartado: $motivo")
            }
        }, baud = BAUD).also { it.iniciar() }
    }

    private fun iniciarHotspot() = escopo.launch {
        if (HotspotManager.hotspotAtivo(this@ServicoBalanca)) return@launch
        // sem ssid/senha: o nome sai do MAC do box e a senha gravada é preservada
        val r = HotspotManager.ligarHotspot(this@ServicoBalanca)
        EstadoHost.registrar("Hotspot: ${r.mensagem}")
        // O tethering do Android reconstrói as chains de NAT ao subir o AP;
        // reaplica o redirect :80 para o frontend seguir acessível sem porta.
        http?.listeningPort?.let { aplicarRedirecionamento80(it, forcar = true) }
    }

    private var estadoRedirect: Pair<List<String>, Boolean>? = null

    /**
     * Redireciona, via root, a porta 80 para a porta real do frontend — só para
     * os IPs do box; sem upstream (cabo desligado) também o tráfego geral, para
     * os probes de conectividade caírem no servidor (ver RedirecionamentoPorta).
     * Reaplicado quando os IPs ou o upstream mudam (laço de reconciliação).
     */
    private fun aplicarRedirecionamento80(portaFrontend: Int, forcar: Boolean = false) = escopo.launch {
        val ips = (EnderecosRede.listarIPv4() + HotspotManager.IP_HOTSPOT).distinct()
        val semUpstream = !RedirecionamentoPorta.detectarUpstream()
        val desejado = ips to semUpstream
        if (!forcar && desejado == estadoRedirect) return@launch
        if (RedirecionamentoPorta.aplicar(ips, redirecionarTudo = semUpstream, portaInterna = portaFrontend)) {
            estadoRedirect = desejado
            EstadoHost.registrar(
                "Frontend em http://<ip> (porta 80 → $portaFrontend) para ${ips.joinToString(", ")}" +
                    if (semUpstream) " — sem internet no cabo: probes de conectividade respondidos pelo box" else "",
            )
        }
    }

    /** Cabo ligado/desligado ou IP novo: refaz o redirect da porta 80. */
    private fun iniciarReconciliacaoRede() = escopo.launch {
        while (true) {
            delay(30_000)
            http?.listeningPort?.let { aplicarRedirecionamento80(it) }
        }
    }

    /** Taxa de pacotes por segundo para o painel. */
    private fun iniciarContadorTaxa() = escopo.launch {
        while (true) {
            delay(1000)
            val n = pacotesNoIntervalo.getAndSet(0).toInt()
            EstadoHost.atualizarEstatisticas { if (it.taxaHz != n) it.copy(taxaHz = n) else it }
        }
    }

    // ─── Notificação ────────────────────────────────────────────────────────

    private fun montarNotificacao(texto: String): Notification {
        val gerenciador = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            gerenciador.getNotificationChannel(CANAL) == null
        ) {
            gerenciador.createNotificationChannel(
                NotificationChannel(CANAL, "Servidor da balança", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )
        return NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("BalançaGFIG")
            .setContentText(texto)
            .setContentIntent(abrir)
            .setOngoing(true)
            .build()
    }

    private fun atualizarNotificacao() {
        val texto = when (val s = EstadoHost.serial.value) {
            EstadoSerial.SemDispositivo -> "Balança desconectada"
            is EstadoSerial.SemPermissao -> "Aguardando permissão USB"
            is EstadoSerial.Conectando -> "Conectando à balança…"
            is EstadoSerial.Conectado -> "Balança conectada"
            is EstadoSerial.Erro -> "Erro: ${s.mensagem}"
            EstadoSerial.Gravando -> "Gravando firmware…"
        }
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(ID_NOTIFICACAO, montarNotificacao(texto))
    }

    companion object {
        private const val TAG = "ServicoBalanca"
        private const val CANAL = "servidor"
        private const val ID_NOTIFICACAO = 1
        const val BAUD = 921600
        const val EXTRA_RECONECTAR_USB = "reconectar_usb"
        const val ARQUIVO_CHAVE_API = ".chave-api"
        /** Opcional: arquivo com outra URL de releases (testes com servidor local). */
        const val ARQUIVO_URL_RELEASES = "atualizacao-url.txt"

        /** Instância viva (um só processo), para a Activity pedir reconexão. */
        @Volatile
        var instancia: ServicoBalanca? = null
            private set

        fun iniciar(context: Context, reconectarUsb: Boolean = false) {
            val intent = Intent(context, ServicoBalanca::class.java)
                .putExtra(EXTRA_RECONECTAR_USB, reconectarUsb)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
