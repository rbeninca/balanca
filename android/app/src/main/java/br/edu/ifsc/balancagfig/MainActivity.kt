package br.edu.ifsc.balancagfig

import android.content.Intent
import android.hardware.usb.UsbManager
import android.os.Bundle
import android.view.WindowManager
import android.app.Activity
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.edu.ifsc.balancagfig.sistema.EnderecosRede
import br.edu.ifsc.balancagfig.sistema.HotspotManager
import br.edu.ifsc.balancagfig.sistema.NavegadorDoBox
import br.edu.ifsc.balancagfig.sistema.PainelFrontalTx9
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** SSID do hotspot local que os celulares usam para acessar a balança. */
// O nome da rede saiu daqui: é calculado por HotspotManager.ssidDoBox(), com os
// 4 últimos dígitos do MAC do eth0 — ver SSID_BASE lá.

/** Frontend servido pelo próprio box (ServidorHttp). */
private const val URL_APP_LOCAL = "http://127.0.0.1:8080"

class MainActivity : ComponentActivity() {
    private var aba by mutableStateOf(Aba.STATUS)
    private var usuarioInteragiu by mutableStateOf(false)

    /**
     * Cada incremento é um pedido de abrir o painel no navegador do box. É um
     * contador, e não o estado da aba, porque tocar de novo em "Balança" com a
     * aba já selecionada precisa abrir o navegador outra vez — e um `aba` que
     * não muda não dispararia efeito nenhum.
     */
    private var pedidosDeAbertura by mutableStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        ServicoBalanca.iniciar(this, reconectarUsb = intent.veioDeUsb())
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                AppComAbas(
                    aba = aba,
                    usuarioInteragiu = usuarioInteragiu,
                    pedidosDeAbertura = pedidosDeAbertura,
                    onSelecionarAba = {
                        aba = it
                        // A Balança não é uma tela do app: é o navegador.
                        if (it == Aba.BALANCA) pedidosDeAbertura++
                        usuarioInteragiu = true
                    },
                    onAutoAbrirBalanca = { pedidosDeAbertura++ },
                )
            }
        }
    }

    /** Chegada de USB_DEVICE_ATTACHED com a Activity já aberta (launchMode singleTask). */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.veioDeUsb()) ServicoBalanca.iniciar(this, reconectarUsb = true)
    }

    private fun Intent?.veioDeUsb() = this?.action == UsbManager.ACTION_USB_DEVICE_ATTACHED
}


/** Activity com duas abas: o painel de status e o painel da balança. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppComAbas(
    aba: Aba,
    usuarioInteragiu: Boolean,
    pedidosDeAbertura: Int,
    onSelecionarAba: (Aba) -> Unit,
    onAutoAbrirBalanca: () -> Unit,
) {
    var jaAutoTrocou by remember { mutableStateOf(false) }
    val serial by EstadoHost.serial.collectAsState()
    val atividade = LocalContext.current as? Activity

    // Começa na aba Status; se a célula de carga estiver conectada, abre o
    // painel automaticamente após alguns segundos (uma única vez, e só se o
    // usuário não tiver escolhido uma aba manualmente).
    LaunchedEffect(serial is EstadoSerial.Conectado) {
        if (NavegacaoInicial.deveAbrirBalanca(serial, jaAutoTrocou, usuarioInteragiu)) {
            delay(NavegacaoInicial.ATRASO_ABRIR_BALANCA_MS)
            if (NavegacaoInicial.deveAbrirBalanca(EstadoHost.serial.value, jaAutoTrocou, usuarioInteragiu)) {
                jaAutoTrocou = true
                onAutoAbrirBalanca()
            }
        }
    }

    LaunchedEffect(pedidosDeAbertura) {
        if (pedidosDeAbertura == 0 || atividade == null) return@LaunchedEffect
        // Sem foco não se arranca a tela de quem está noutro app: o painel
        // automático vale quando o box está mostrando a balança, não sempre.
        if (!atividade.hasWindowFocus()) return@LaunchedEffect
        if (!NavegadorDoBox.abrir(atividade, URL_APP_LOCAL)) {
            Toast.makeText(atividade, "Nenhum navegador instalado neste box.", Toast.LENGTH_LONG).show()
        }
    }

    Scaffold(
        topBar = { BarraSuperior(aba, onSelecionarAba) },
    ) { interno ->
        when (aba) {
            Aba.STATUS -> ConteudoStatus(interno)
            Aba.BALANCA -> TelaBalanca(interno) { onSelecionarAba(Aba.BALANCA) }
        }
    }
}

/** Barra superior: nome do app + abas. Oculta quando a Balança está em tela cheia. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BarraSuperior(aba: Aba, onSelecionar: (Aba) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.primaryContainer),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "BalançaGFIG",
            modifier = Modifier.padding(horizontal = 16.dp),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        TabRow(
            selectedTabIndex = aba.ordinal,
            modifier = Modifier.weight(1f),
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ) {
            Aba.values().forEach { a ->
                Tab(
                    selected = aba == a,
                    onClick = { onSelecionar(a) },
                    text = { Text(a.titulo) },
                )
            }
        }
    }
}

/**
 * Aba Balança.
 *
 * O painel (frontend que o próprio box serve em 127.0.0.1:8080) abre no
 * navegador instalado, não dentro do app: embutir o GeckoView custava 108 dos
 * 122 MB do APK, e o box já traz o Chrome — que roda o frontend sem ajuste
 * nenhum. Esta tela só explica isso, oferece o botão de abrir e mostra os
 * endereços que os celulares da bancada usam.
 */
@Composable
private fun TelaBalanca(interno: PaddingValues, onAbrir: () -> Unit) {
    var enderecosIP by remember { mutableStateOf(EnderecosRede.listarIPv4()) }
    LaunchedEffect(Unit) {
        while (true) {
            enderecosIP = EnderecosRede.listarIPv4()
            delay(3000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(interno)
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Cartao("Painel da balança") {
            Text(
                "O painel abre no navegador do box, numa aba própria — fora do app.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(12.dp))
            FilledTonalButton(onClick = onAbrir, modifier = Modifier.height(56.dp)) {
                Text("ABRIR O PAINEL")
            }
            Spacer(Modifier.height(8.dp))
            Mono(URL_APP_LOCAL)
        }

        Cartao("No celular ou tablet") {
            Text(
                "Conecte o aparelho na rede ${HotspotManager.ssidDoBox()} e abra:",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(8.dp))
            EnderecosRede.enderecosDeAcesso(HotspotManager.IP_HOTSPOT, enderecosIP)
                .forEach { ip -> Mono("http://$ip") }
        }
    }
}

/**
 * Painel de status do host: rede, balança e hotspot, alimentado pelo
 * [EstadoHost] que o [ServicoBalanca] mantém.
 */
@Composable
private fun ConteudoStatus(interno: PaddingValues) {
    val contexto = LocalContext.current
    val escopo = rememberCoroutineScope()

    val serial by EstadoHost.serial.collectAsState()
    val stats by EstadoHost.estatisticas.collectAsState()
    val portaHttp by EstadoHost.portaHttp.collectAsState()
    val registro by EstadoHost.registro.collectAsState()
    val pendrive by EstadoHost.pendrive.collectAsState()

    var enderecosIP by remember { mutableStateOf(EnderecosRede.listarIPv4()) }
    var hotspotLigado by remember { mutableStateOf(HotspotManager.hotspotAtivo(contexto)) }
    var hotspotOcupado by remember { mutableStateOf(false) }
    var ssidBox by remember { mutableStateOf(HotspotManager.ssidDoBox()) }
    var senhaBox by remember { mutableStateOf(HotspotManager.senhaDoHotspot(contexto)) }
    var novaSenha by remember { mutableStateOf("") }

    // Rede muda sem aviso (hotspot subindo, cabo): reavalia periodicamente
    LaunchedEffect(Unit) {
        while (true) {
            enderecosIP = EnderecosRede.listarIPv4()
            hotspotLigado = HotspotManager.hotspotAtivo(contexto)
            ssidBox = HotspotManager.ssidDoBox()
            senhaBox = HotspotManager.senhaDoHotspot(contexto)
            delay(3000)
        }
    }

    // Display frontal do TX9: nome do app → IP abreviado → hora
    LaunchedEffect(Unit) {
        while (true) {
            PainelFrontalTx9.mostrarTexto("GFIG")
            delay(1500)
            PainelFrontalTx9.mostrarTexto(EnderecosRede.abreviarParaPainel(enderecosIP.firstOrNull()))
            delay(1500)
            PainelFrontalTx9.mostrarHoraAtual()
            delay(3000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(interno)
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Cartao("Balança", Modifier.weight(1f)) {
                val (texto, cor) = when (val s = serial) {
                    EstadoSerial.SemDispositivo -> "Nenhum conversor USB-serial conectado" to Color(0xFFE57373)
                    is EstadoSerial.SemPermissao -> "Aguardando permissão USB…" to Color(0xFFFFB74D)
                    is EstadoSerial.Conectando -> "Conectando…" to Color(0xFFFFB74D)
                    is EstadoSerial.Conectado -> "Conectada — ${s.nomeDispositivo} @ ${s.baud}" to Color(0xFF81C784)
                    is EstadoSerial.Erro -> "Erro: ${s.mensagem}" to Color(0xFFE57373)
                    EstadoSerial.Gravando -> "Gravando firmware…" to Color(0xFFFFB74D)
                }
                Text(texto, color = cor, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                val u = stats.ultimo
                Text(
                    if (u != null) "%.2f N".format(u.forcaNewtons) else "— N",
                    fontSize = 40.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Mono("bruto ${u?.forcaBruta ?: "—"}   t=${u?.marcaTemporal ?: "—"} ms   status ${u?.statusFirmware ?: "—"}")
                Mono("${stats.taxaHz} Hz   ${stats.pacotes} pacotes   ${stats.errosCrc} erros CRC")
            }

            Cartao("Rede", Modifier.weight(1f)) {
                when {
                    portaHttp == null -> Text("Servidor HTTP não está no ar", color = Color(0xFFE57373))
                    enderecosIP.isEmpty() -> Text("Sem conexão de rede")
                    else -> enderecosIP.forEach { ip -> Mono("http://$ip") }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Hotspot $ssidBox: ${if (hotspotLigado) "ligado (${HotspotManager.IP_HOTSPOT})" else "desligado"}",
                    style = MaterialTheme.typography.bodyMedium
                )
                Mono("senha: ${senhaBox ?: "—"}")

                // Troca da senha da rede. Fica aqui, junto do botão que liga o
                // hotspot, porque é a mesma coisa que ele controla.
                Spacer(Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = novaSenha,
                        onValueChange = { novaSenha = it.take(63) },
                        label = { Text("nova senha (8 a 63)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    FilledTonalButton(
                        enabled = novaSenha.length in 8..63 && !hotspotOcupado,
                        onClick = {
                            escopo.launch {
                                hotspotOcupado = true
                                val r = HotspotManager.trocarSenha(contexto, novaSenha)
                                if (r.sucesso) {
                                    // senha nova só vale com o AP religado
                                    HotspotManager.desligarHotspot(contexto)
                                    HotspotManager.ligarHotspot(contexto, senha = novaSenha)
                                    novaSenha = ""
                                }
                                Toast.makeText(contexto, r.mensagem, Toast.LENGTH_LONG).show()
                                if (r.precisaPermissaoEscrita) {
                                    HotspotManager.intentPermissaoEscrita(contexto)?.let { contexto.startActivity(it) }
                                }
                                senhaBox = HotspotManager.senhaDoHotspot(contexto)
                                hotspotLigado = HotspotManager.hotspotAtivo(contexto)
                                hotspotOcupado = false
                            }
                        },
                    ) { Text("TROCAR") }
                }

                Spacer(Modifier.height(4.dp))
                val pd = pendrive
                Text(
                    if (pd != null)
                        "Pendrive ${pd.id}: ${pd.sessoesSalvas} teste(s), ${pd.livreBytes / 1_000_000} MB livres"
                    else "Pendrive: nenhum",
                    color = if (pd != null) Color(0xFF81C784) else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        Cartao("Registro") {
            val estadoLista = rememberLazyListState()
            // acompanha o mais recente: rola para o fim quando chega um registro novo
            LaunchedEffect(registro.size) {
                if (registro.isNotEmpty()) estadoLista.animateScrollToItem(registro.size - 1)
            }
            LazyColumn(
                state = estadoLista,
                modifier = Modifier.fillMaxWidth().height(180.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                items(registro) { linha -> Mono(linha) }
            }
        }

        FilledTonalButton(
            enabled = !hotspotOcupado,
            onClick = {
                escopo.launch {
                    hotspotOcupado = true
                    val resultado = if (hotspotLigado) {
                        HotspotManager.desligarHotspot(contexto)
                    } else {
                        // sem senha: preserva a que estiver gravada no box
                        HotspotManager.ligarHotspot(contexto)
                    }
                    Toast.makeText(contexto, resultado.mensagem, Toast.LENGTH_LONG).show()
                    if (resultado.precisaPermissaoEscrita) {
                        HotspotManager.intentPermissaoEscrita(contexto)?.let { contexto.startActivity(it) }
                    }
                    hotspotLigado = HotspotManager.hotspotAtivo(contexto)
                    enderecosIP = EnderecosRede.listarIPv4()
                    hotspotOcupado = false
                }
            },
            modifier = Modifier.fillMaxWidth().height(56.dp)
        ) {
            Text(
                when {
                    hotspotOcupado -> "AGUARDE..."
                    hotspotLigado -> "DESLIGAR HOTSPOT $ssidBox"
                    else -> "LIGAR HOTSPOT $ssidBox"
                }
            )
        }
    }
}

@Composable
private fun Cartao(titulo: String, modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(titulo, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            conteudo()
        }
    }
}

@Composable
private fun Mono(texto: String) {
    Text(texto, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium)
}
