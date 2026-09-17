package br.edu.ifsc.balancagfig

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Situação da porta serial da balança. */
sealed interface EstadoSerial {
    data object SemDispositivo : EstadoSerial
    data class SemPermissao(val nomeDispositivo: String) : EstadoSerial
    data class Conectando(val nomeDispositivo: String) : EstadoSerial
    data class Conectado(val nomeDispositivo: String, val baud: Int) : EstadoSerial
    data class Erro(val mensagem: String) : EstadoSerial
    data object Gravando : EstadoSerial
}

/** Estatísticas de leitura para o painel. */
data class EstatisticasSerial(
    val pacotes: Long = 0,
    val errosCrc: Long = 0,
    val taxaHz: Int = 0,
    val ultimo: PacoteDados? = null,
)

/**
 * Estado observável do host, escrito pelo [ServicoBalanca] e lido pela UI.
 * Objeto único porque serviço e Activity vivem no mesmo processo.
 */
object EstadoHost {
    private val _serial = MutableStateFlow<EstadoSerial>(EstadoSerial.SemDispositivo)
    val serial: StateFlow<EstadoSerial> = _serial.asStateFlow()

    private val _estatisticas = MutableStateFlow(EstatisticasSerial())
    val estatisticas: StateFlow<EstatisticasSerial> = _estatisticas.asStateFlow()

    /** Porta HTTP em que o frontend está sendo servido, ou null se o servidor não subiu. */
    private val _portaHttp = MutableStateFlow<Int?>(null)
    val portaHttp: StateFlow<Int?> = _portaHttp.asStateFlow()

    /** Pendrive de backup, quando presente. */
    data class Pendrive(val id: String, val livreBytes: Long, val sessoesSalvas: Int)
    private val _pendrive = MutableStateFlow<Pendrive?>(null)
    val pendrive: StateFlow<Pendrive?> = _pendrive.asStateFlow()
    internal fun definirPendrive(p: Pendrive?) { _pendrive.value = p }

    private val _servicoAtivo = MutableStateFlow(false)
    val servicoAtivo: StateFlow<Boolean> = _servicoAtivo.asStateFlow()

    /** Últimas mensagens de log (mais recente por último), limitadas para a UI. */
    private val _registro = MutableStateFlow<List<String>>(emptyList())
    val registro: StateFlow<List<String>> = _registro.asStateFlow()

    internal fun definirSerial(e: EstadoSerial) { _serial.value = e }
    internal fun definirPortaHttp(p: Int?) { _portaHttp.value = p }
    internal fun definirServicoAtivo(v: Boolean) { _servicoAtivo.value = v }
    internal fun atualizarEstatisticas(f: (EstatisticasSerial) -> EstatisticasSerial) = _estatisticas.update(f)

    internal fun registrar(msg: String) {
        _registro.update { (it + msg).takeLast(100) }
    }
}
