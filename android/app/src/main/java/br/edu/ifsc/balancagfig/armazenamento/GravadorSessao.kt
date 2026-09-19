package br.edu.ifsc.balancagfig.armazenamento

import br.edu.ifsc.balancagfig.processamento.LeituraProcessada
import org.json.JSONObject

/**
 * Gravação de sessão feita no próprio gateway, alimentada direto pelo pipeline
 * (não pelo WebSocket): um único estado compartilhado por todos os clientes.
 * Qualquer cliente pode iniciar ou parar; quem parou recebe o id da sessão
 * para abrir a análise. A gravação continua mesmo que todos os clientes caiam.
 *
 * As leituras vão ao banco em lotes (thread própria do [destino]), com os
 * mesmos campos que o frontend gravava via POST /sessoes/:id/leituras.
 */
class GravadorSessao(
    private val destino: Destino,
    private val aoMudar: (EstadoGravacao) -> Unit,
    private val agora: () -> Long = System::currentTimeMillis,
    private val tamanhoLote: Int = 50,
    /** Fotografia da configuração (pipeline, ESP) no início da gravação: (configPipeline, configEsp) em JSON. */
    private val configAtual: () -> Pair<String?, String?> = { null to null },
) {
    /** Onde as leituras são persistidas (SQLite no app; simulado nos testes). */
    interface Destino {
        /** [configPipeline]/[configEsp]: JSON da configuração vigente ao iniciar (pode ser null). */
        fun criarSessao(nome: String, configPipeline: String?, configEsp: String?): String
        fun inserir(idSessao: String, lote: List<LeituraProcessada>)
        /** Métricas/resumo após a última inserção. */
        fun finalizar(idSessao: String)
    }

    data class SessaoEncerrada(val id: String, val nome: String, val amostras: Long, val paradaPor: String, val emMs: Long) {
        fun paraJson(): JSONObject = JSONObject()
            .put("id", id).put("nome", nome).put("amostras", amostras).put("paradaPor", paradaPor).put("emMs", emMs)
    }

    data class EstadoGravacao(
        val gravando: Boolean = false,
        val idSessao: String? = null,
        val nome: String? = null,
        val inicioMs: Long? = null,
        val amostras: Long = 0,
        val iniciadaPor: String? = null,
        /** Última sessão encerrada, para os outros clientes saberem que foi salva e por quem. */
        val ultima: SessaoEncerrada? = null,
    ) {
        fun paraJson(): JSONObject = JSONObject()
            .put("gravando", gravando)
            .put("idSessao", idSessao ?: JSONObject.NULL)
            .put("nome", nome ?: JSONObject.NULL)
            .put("inicioMs", inicioMs ?: JSONObject.NULL)
            .put("amostras", amostras)
            .put("iniciadaPor", iniciadaPor ?: JSONObject.NULL)
            .put("ultima", ultima?.paraJson() ?: JSONObject.NULL)
    }

    @Volatile var estado = EstadoGravacao()
        private set

    private val lock = Any()
    private var buffer = ArrayList<LeituraProcessada>(tamanhoLote)

    /** Começa uma sessão; false (sem mudar nada) se já há gravação em curso. */
    fun iniciar(nome: String, por: String): Boolean {
        val nomeFinal = nome.trim().ifEmpty { "Sessão ${formatarData(agora())}" }
        val id: String
        synchronized(lock) {
            if (estado.gravando) return false
            val (configPipeline, configEsp) = configAtual()
            id = destino.criarSessao(nomeFinal, configPipeline, configEsp)
            buffer = ArrayList(tamanhoLote)
            estado = EstadoGravacao(gravando = true, idSessao = id, nome = nomeFinal, inicioMs = agora(), iniciadaPor = por, ultima = estado.ultima)
        }
        aoMudar(estado)
        return true
    }

    /** Chamado pelo pipeline a cada leitura (thread serial); barato fora de gravação. */
    fun receber(l: LeituraProcessada) {
        val lote: List<LeituraProcessada>?
        val id: String
        synchronized(lock) {
            val e = estado
            if (!e.gravando) return
            id = e.idSessao!!
            buffer.add(l)
            estado = e.copy(amostras = e.amostras + 1)
            lote = if (buffer.size >= tamanhoLote) buffer.also { buffer = ArrayList(tamanhoLote) } else null
        }
        if (lote != null) destino.inserir(id, lote)
    }

    /** Encerra a sessão e devolve o que foi gravado; null se não havia gravação. */
    fun parar(por: String): SessaoEncerrada? {
        val restante: List<LeituraProcessada>
        val encerrada: SessaoEncerrada
        synchronized(lock) {
            val e = estado
            if (!e.gravando) return null
            restante = buffer.also { buffer = ArrayList(tamanhoLote) }
            encerrada = SessaoEncerrada(e.idSessao!!, e.nome!!, e.amostras, por, agora())
            estado = EstadoGravacao(ultima = encerrada)
        }
        if (restante.isNotEmpty()) destino.inserir(encerrada.id, restante)
        destino.finalizar(encerrada.id)
        aoMudar(estado)
        return encerrada
    }

    private fun formatarData(ms: Long): String =
        java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss", java.util.Locale("pt", "BR")).format(java.util.Date(ms))
}
