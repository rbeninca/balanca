package br.edu.ifsc.balancagfig

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
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
import br.edu.ifsc.balancagfig.servidor.Mensagens
import br.edu.ifsc.balancagfig.servidor.ServidorHttp
import br.edu.ifsc.balancagfig.servidor.ServidorSaude
import br.edu.ifsc.balancagfig.servidor.ServidorWs
import br.edu.ifsc.balancagfig.sistema.HotspotManager
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
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

    /** Mesmos padrões do gateway Node (variáveis de ambiente do principal.ts). */
    private val pipeline = PipelineProcessamento(ConfiguracaoPipeline())

    private val pacotesNoIntervalo = AtomicLong(0)

    override fun onCreate() {
        super.onCreate()
        instancia = this
        startForeground(ID_NOTIFICACAO, montarNotificacao("Iniciando…"))

        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG:servico")
            .also { it.acquire() }

        iniciarHttp()
        iniciarWebSocket()
        iniciarSerial()
        iniciarHotspot()
        iniciarContadorTaxa()

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
        } catch (e: IOException) {
            Log.e(TAG, "servidor HTTP não subiu", e)
            EstadoHost.registrar("Servidor HTTP falhou: ${e.message}")
        }
    }

    private fun iniciarWebSocket() {
        try {
            ws = ServidorWs(
                estadoInicial = { Mensagens.pipelineEstado(pipeline.obterConfig()) },
                aoReceber = ::tratarMensagemCliente,
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

    /** Mensagens vindas do frontend: config do pipeline fica aqui, comandos vão para o ESP. */
    private fun tratarMensagemCliente(entrada: Mensagens.Entrada) {
        when (entrada) {
            is Mensagens.Entrada.ConfigPipeline -> {
                pipeline.atualizarConfig(entrada.patch)
                ws?.difundir(Mensagens.pipelineEstado(pipeline.obterConfig()))
            }
            is Mensagens.Entrada.Comando -> enviarAoEsp(entrada.comando)
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
                        ws?.difundir(Mensagens.leitura(leitura))
                    }
                    is PacoteConfiguracao -> {
                        EstadoHost.registrar("ESP: $pacote")
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
        val r = HotspotManager.ligarHotspot(this@ServicoBalanca, SSID_HOTSPOT)
        EstadoHost.registrar("Hotspot: ${r.mensagem}")
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
