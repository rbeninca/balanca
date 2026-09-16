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
import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import br.edu.ifsc.balancagfig.protocolo.PacoteESP
import br.edu.ifsc.balancagfig.serial.PortaSerialUsb
import br.edu.ifsc.balancagfig.servidor.ServidorHttp
import br.edu.ifsc.balancagfig.sistema.HotspotManager
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.concurrent.atomic.AtomicLong

/**
 * Serviço em primeiro plano que mantém a balança no ar enquanto o box estiver
 * ligado: porta serial USB, servidor do frontend e hotspot. Substitui os
 * containers gateway + webapp do Cenário A (api e WebSocket entram nas próximas fases).
 */
class ServicoBalanca : Service() {

    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var wakeLock: PowerManager.WakeLock? = null

    private var porta: PortaSerialUsb? = null
    private var http: ServidorHttp? = null

    private val pacotesNoIntervalo = AtomicLong(0)

    override fun onCreate() {
        super.onCreate()
        instancia = this
        startForeground(ID_NOTIFICACAO, montarNotificacao("Iniciando…"))

        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG:servico")
            .also { it.acquire() }

        iniciarHttp()
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
            }

            override fun aoReceber(pacote: PacoteESP) {
                if (pacote is PacoteDados) {
                    pacotesNoIntervalo.incrementAndGet()
                    EstadoHost.atualizarEstatisticas { it.copy(pacotes = it.pacotes + 1, ultimo = pacote) }
                } else {
                    EstadoHost.registrar("ESP: $pacote")
                }
            }

            override fun aoFalharDecodificacao(motivo: String) {
                EstadoHost.atualizarEstatisticas { it.copy(errosCrc = it.errosCrc + 1) }
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
