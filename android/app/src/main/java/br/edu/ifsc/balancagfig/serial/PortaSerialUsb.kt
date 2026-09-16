package br.edu.ifsc.balancagfig.serial

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import br.edu.ifsc.balancagfig.protocolo.Enquadrador
import br.edu.ifsc.balancagfig.protocolo.PacoteESP
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import br.edu.ifsc.balancagfig.sistema.Root
import java.io.IOException
import java.util.concurrent.Executors

/**
 * Porta serial da balança sobre a USB Host API (usb-serial-for-android).
 * Equivalente a pacotes/gateway/src/PortaSerial.ts: conecta, enquadra os
 * pacotes, reconecta quando o dispositivo é plugado/desplugado e permite
 * enviar comandos ao ESP.
 *
 * O kernel do TX9 não tem driver ch341, então o CH340 só é acessível por
 * este caminho — sem /dev/ttyUSB0.
 */
class PortaSerialUsb(
    private val context: Context,
    private val baud: Int = 921600,
    private val ouvinte: Ouvinte,
) {
    interface Ouvinte {
        fun aoMudarEstado(estado: Estado)
        fun aoReceber(pacote: PacoteESP)
        fun aoFalharDecodificacao(motivo: String)
    }

    sealed interface Estado {
        data object SemDispositivo : Estado
        data class SemPermissao(val dispositivo: UsbDevice) : Estado
        data class Conectando(val dispositivo: UsbDevice) : Estado
        data class Conectado(val dispositivo: UsbDevice) : Estado
        data class Erro(val mensagem: String) : Estado
    }

    private val usb = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val enquadrador = Enquadrador(ouvinte::aoReceber, ouvinte::aoFalharDecodificacao)

    private var porta: UsbSerialPort? = null
    private var io: SerialInputOutputManager? = null
    private var receptorRegistrado = false

    /** Conexão e chamadas a `su` bloqueiam; rodam fora da thread principal, uma por vez. */
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "PortaSerialUsb") }

    /**
     * A reenumeração via root gera DETACHED+ATTACHED; se não resultar em permissão,
     * não insistir indefinidamente. Zera quando a porta abre.
     */
    private var tentativasReenumeracao = 0

    private val acaoPermissao = "${context.packageName}.PERMISSAO_USB"

    private val receptor = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            when (intent.action) {
                acaoPermissao -> {
                    val concedida = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    Log.i(TAG, "permissão USB ${if (concedida) "concedida" else "negada"}")
                    if (concedida) conectar() else ouvinte.aoMudarEstado(Estado.Erro("Permissão USB negada"))
                }
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    // O broadcast pode chegar antes de o sistema conceder a permissão
                    // ao lançar a Activity pelo filtro; dá tempo para isso acontecer.
                    executor.execute { Thread.sleep(ATRASO_APOS_ATTACH_MS); conectarAgora() }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val d = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                    if (d == null || d.deviceName == porta?.device?.deviceName) {
                        fecharPorta("dispositivo removido")
                        ouvinte.aoMudarEstado(Estado.SemDispositivo)
                    }
                }
            }
        }
    }

    /** Registra os receptores e tenta a primeira conexão. */
    fun iniciar() {
        if (!receptorRegistrado) {
            val filtro = IntentFilter().apply {
                addAction(acaoPermissao)
                addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
                addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receptor, filtro, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receptor, filtro)
            }
            receptorRegistrado = true
        }
        conectar()
    }

    fun parar() {
        executor.shutdownNow()
        fecharPorta("encerrado")
        if (receptorRegistrado) {
            context.unregisterReceiver(receptor)
            receptorRegistrado = false
        }
    }

    /**
     * Obtém a permissão USB: sem diálogo via root quando possível
     * (ver [AutorizacaoUsb]); senão, pelo diálogo do sistema.
     */
    fun solicitarPermissao() = executor.execute {
        val driver = localizarDriver() ?: return@execute
        if (tentativasReenumeracao < MAX_REENUMERACOES && Root.disponivel()) {
            tentativasReenumeracao++
            if (AutorizacaoUsb.reenumerar(driver.device)) return@execute
        }
        solicitarPermissaoPorDialogo(driver)
    }

    private fun solicitarPermissaoPorDialogo(driver: UsbSerialDriver) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getBroadcast(
            context, 0, Intent(acaoPermissao).setPackage(context.packageName), flags
        )
        usb.requestPermission(driver.device, pi)
    }

    /** Envia bytes ao ESP. Lança IOException se a porta não estiver aberta. */
    @Throws(IOException::class)
    fun enviar(bytes: ByteArray) {
        val p = porta ?: throw IOException("Porta serial não está aberta")
        p.write(bytes, TIMEOUT_ESCRITA_MS)
    }

    val conectado: Boolean get() = porta?.isOpen == true

    // ─── Interno ────────────────────────────────────────────────────────────

    /** Primeiro conversor USB-serial conhecido pelo prober padrão da biblioteca. */
    private fun localizarDriver(): UsbSerialDriver? =
        UsbSerialProber.getDefaultProber().findAllDrivers(usb).firstOrNull()

    /** Agenda uma tentativa de conexão na thread da porta. */
    fun conectar() = executor.execute { conectarAgora() }

    @Synchronized
    private fun conectarAgora() {
        if (conectado) return

        val driver = localizarDriver()
        if (driver == null) {
            ouvinte.aoMudarEstado(Estado.SemDispositivo)
            return
        }
        if (!usb.hasPermission(driver.device)) {
            ouvinte.aoMudarEstado(Estado.SemPermissao(driver.device))
            solicitarPermissao()
            return
        }

        ouvinte.aoMudarEstado(Estado.Conectando(driver.device))
        val conexao = usb.openDevice(driver.device)
        if (conexao == null) {
            ouvinte.aoMudarEstado(Estado.Erro("openDevice falhou (dispositivo ocupado?)"))
            return
        }

        try {
            val p = driver.ports[0]
            p.open(conexao)
            p.setParameters(baud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
            // Como no Linux/serialport: DTR e RTS ativos mantêm GPIO0 e RST em nível
            // alto no circuito de auto-reset do NodeMCU — o ESP roda normalmente.
            p.dtr = true
            p.rts = true
            porta = p
            enquadrador.limpar()

            io = SerialInputOutputManager(p, object : SerialInputOutputManager.Listener {
                override fun onNewData(data: ByteArray) = enquadrador.alimentar(data)
                override fun onRunError(e: Exception) {
                    Log.w(TAG, "erro de leitura: ${e.message}")
                    fecharPorta(e.message ?: "erro de leitura")
                    ouvinte.aoMudarEstado(Estado.Erro(e.message ?: "erro de leitura"))
                    // Como o gateway TS: tenta de novo em vez de ficar parado em erro
                    executor.execute { Thread.sleep(ATRASO_RECONEXAO_MS); conectarAgora() }
                }
            }).also {
                it.readTimeout = TIMEOUT_LEITURA_MS
                it.start()
            }
            tentativasReenumeracao = 0
            ouvinte.aoMudarEstado(Estado.Conectado(driver.device))
            Log.i(TAG, "conectado a ${driver.device.deviceName} @ $baud")
        } catch (e: Exception) {
            Log.e(TAG, "falha ao abrir porta", e)
            fecharPorta(e.message ?: "falha ao abrir")
            ouvinte.aoMudarEstado(Estado.Erro("Falha ao abrir: ${e.message}"))
        }
    }

    @Synchronized
    private fun fecharPorta(motivo: String) {
        io?.listener = null
        io?.stop()
        io = null
        try { porta?.close() } catch (_: IOException) { }
        if (porta != null) Log.i(TAG, "porta fechada: $motivo")
        porta = null
    }

    private companion object {
        const val TAG = "PortaSerialUsb"
        const val TIMEOUT_ESCRITA_MS = 500
        const val TIMEOUT_LEITURA_MS = 200
        const val ATRASO_APOS_ATTACH_MS = 1000L
        const val ATRASO_RECONEXAO_MS = 2000L
        const val MAX_REENUMERACOES = 2
    }
}
