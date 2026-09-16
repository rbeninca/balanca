package br.edu.ifsc.balancagfig

import android.content.Intent
import android.hardware.usb.UsbManager
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.edu.ifsc.balancagfig.sistema.EnderecosRede
import br.edu.ifsc.balancagfig.sistema.HotspotManager
import br.edu.ifsc.balancagfig.sistema.PainelFrontalTx9
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** SSID do hotspot local que os celulares usam para acessar a balança. */
const val SSID_HOTSPOT = "balancaGFIG"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        ServicoBalanca.iniciar(this, reconectarUsb = intent.veioDeUsb())
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                PainelStatus()
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

/**
 * Painel de status do host: rede, balança e hotspot, alimentado pelo
 * [EstadoHost] que o [ServicoBalanca] mantém. A WebView com o frontend entra
 * quando a WebView do box for atualizada (Chromium 52 não roda o bundle).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PainelStatus() {
    val contexto = LocalContext.current
    val escopo = rememberCoroutineScope()

    val serial by EstadoHost.serial.collectAsState()
    val stats by EstadoHost.estatisticas.collectAsState()
    val portaHttp by EstadoHost.portaHttp.collectAsState()
    val registro by EstadoHost.registro.collectAsState()

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("BalançaGFIG — Host") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { interno ->
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
                }
            }

            Cartao("Registro") {
                registro.takeLast(12).forEach { Mono(it) }
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
