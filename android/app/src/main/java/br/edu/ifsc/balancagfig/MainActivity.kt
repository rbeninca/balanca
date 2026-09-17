package br.edu.ifsc.balancagfig

import android.content.Intent
import android.hardware.usb.UsbManager
import android.os.Bundle
import android.view.WindowManager
import android.content.Context
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.viewinterop.AndroidView
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import br.edu.ifsc.balancagfig.sistema.EnderecosRede
import br.edu.ifsc.balancagfig.sistema.HotspotManager
import br.edu.ifsc.balancagfig.sistema.PainelFrontalTx9
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** SSID do hotspot local que os celulares usam para acessar a balança. */
const val SSID_HOTSPOT = "balancaGFIG"

/** Frontend servido pelo próprio box (ServidorHttp). */
private const val URL_APP_LOCAL = "http://127.0.0.1:8080"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        ServicoBalanca.iniciar(this, reconectarUsb = intent.veioDeUsb())
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                AppComAbas()
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

private enum class Aba(val titulo: String) { STATUS("Status"), BALANCA("Balança") }

/** Activity com duas abas: o painel de status e a interface web servida pelo box. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppComAbas() {
    var aba by remember { mutableStateOf(Aba.STATUS) }
    Scaffold(
        topBar = {
            // Barra única: nome do app à esquerda + abas ao lado, para não gastar
            // uma faixa inteira só com o título (a TV do box tem pouca altura útil).
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
                            onClick = { aba = a },
                            text = { Text(a.titulo) },
                        )
                    }
                }
            }
        }
    ) { interno ->
        when (aba) {
            Aba.STATUS -> ConteudoStatus(interno)
            Aba.BALANCA -> TelaWeb(interno)
        }
    }
}

/** GeckoRuntime é único por processo; criado sob demanda e reaproveitado. */
private object Gecko {
    @Volatile private var runtime: GeckoRuntime? = null
    fun runtime(ctx: Context): GeckoRuntime =
        runtime ?: synchronized(this) {
            runtime ?: GeckoRuntime.create(ctx.applicationContext).also { runtime = it }
        }
}

/**
 * Aba que exibe o frontend servido pelo próprio box (127.0.0.1:8080) num
 * GeckoView (motor Firefox embutido) — a WebView do sistema (Chromium 52) é
 * antiga demais para o bundle es2022/CSS Grid do frontend.
 */
@Composable
private fun TelaWeb(interno: PaddingValues) {
    val ctx = LocalContext.current
    val sessao = remember {
        GeckoSession().apply {
            open(Gecko.runtime(ctx))
            loadUri(URL_APP_LOCAL)
        }
    }
    DisposableEffect(Unit) {
        onDispose { sessao.close() }
    }
    AndroidView(
        modifier = Modifier.fillMaxSize().padding(interno),
        factory = { c -> GeckoView(c).apply { setSession(sessao) } },
    )
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

    // Rede muda sem aviso (hotspot subindo, cabo): reavalia periodicamente
    LaunchedEffect(Unit) {
        while (true) {
            enderecosIP = EnderecosRede.listarIPv4()
            hotspotLigado = HotspotManager.hotspotAtivo(contexto)
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
                    else -> enderecosIP.forEach { ip -> Mono("http://$ip:$portaHttp") }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Hotspot $SSID_HOTSPOT: ${if (hotspotLigado) "ligado (${HotspotManager.IP_HOTSPOT})" else "desligado"}",
                    style = MaterialTheme.typography.bodyMedium
                )
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
                        HotspotManager.ligarHotspot(contexto, SSID_HOTSPOT)
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
                    hotspotLigado -> "DESLIGAR HOTSPOT $SSID_HOTSPOT"
                    else -> "LIGAR HOTSPOT $SSID_HOTSPOT"
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
