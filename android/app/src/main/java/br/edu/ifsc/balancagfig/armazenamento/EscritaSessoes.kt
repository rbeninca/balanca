package br.edu.ifsc.balancagfig.armazenamento

import br.edu.ifsc.balancagfig.processamento.LeituraProcessada
import java.util.UUID
import java.util.concurrent.Executors

/** SQL de escrita de sessões, compartilhado pela API REST e pelo gravador do gateway. */
object EscritaSessoes {

    fun criarSessao(bd: BancoDados, nome: String, idMotor: String? = null, observacoes: String? = null): String {
        val id = UUID.randomUUID().toString()
        bd.executar("INSERT INTO sessoes (id, nome, id_motor, observacoes) VALUES (?, ?, ?, ?)", id, nome, idMotor, observacoes)
        return id
    }

    /**
     * Insere leituras processadas com os mesmos campos que ArmazenamentoApi.ts
     * envia: forca_crua recebe forcaNewtonCrua (antes dos filtros), como no frontend.
     */
    fun inserirLeituras(bd: BancoDados, idSessao: String, lote: List<LeituraProcessada>) {
        if (lote.isEmpty()) return
        bd.transacao { db ->
            val stmt = db.compileStatement(
                "INSERT INTO leituras (id_sessao, marca_temporal, forca_crua, temperatura, em_queima, impulso_acumulado_ns) VALUES (?, ?, ?, ?, ?, ?)"
            )
            for (l in lote) {
                stmt.clearBindings()
                stmt.bindString(1, idSessao)
                stmt.bindLong(2, l.marcaTemporal)
                stmt.bindDouble(3, l.forcaNewtonCrua)
                stmt.bindDouble(4, l.temperatura)
                stmt.bindLong(5, if (l.emQueima) 1 else 0)
                stmt.bindDouble(6, l.impulsoAcumuladoNs)
                stmt.executeInsert()
            }
        }
    }

    /** duracao_ms, forca_maxima_n e impulso_total_ns derivados das leituras (como atualizarMetricasSessao do Node). */
    fun atualizarMetricas(bd: BancoDados, id: String) {
        val m = bd.consultarUm(
            """SELECT MAX(forca_crua) AS forca_maxima,
                      MAX(marca_temporal) - MIN(marca_temporal) AS duracao,
                      (SELECT impulso_acumulado_ns FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal DESC LIMIT 1) AS ultimo_impulso,
                      COUNT(*) AS n
               FROM leituras WHERE id_sessao = ?""",
            id, id,
        ) ?: return
        if (m.optLong("n") == 0L) return
        bd.executar(
            "UPDATE sessoes SET duracao_ms = ?, forca_maxima_n = ?, impulso_total_ns = ? WHERE id = ?",
            m.optLong("duracao"), m.optDouble("forca_maxima", 0.0), m.optDouble("ultimo_impulso", 0.0), id,
        )
    }

    /**
     * Destino do [GravadorSessao] no SQLite. A escrita roda numa thread própria
     * para a thread serial nunca esperar o banco.
     */
    class DestinoBanco(private val bd: BancoDados, private val aoSalvarSessao: (String) -> Unit) : GravadorSessao.Destino {
        private val escritor = Executors.newSingleThreadExecutor { r -> Thread(r, "GravadorSessao-escrita") }

        override fun criarSessao(nome: String): String = criarSessao(bd, nome)

        override fun inserir(idSessao: String, lote: List<LeituraProcessada>) {
            escritor.execute { inserirLeituras(bd, idSessao, lote) }
        }

        /** Bloqueia até os lotes pendentes estarem no banco: quem parou vai buscar a sessão em seguida. */
        override fun finalizar(idSessao: String) {
            escritor.submit {
                atualizarMetricas(bd, idSessao)
                ResumoSessao.gravar(bd, idSessao)
                aoSalvarSessao(idSessao)
            }.get()
        }

        fun encerrar() = escritor.shutdown()
    }
}
