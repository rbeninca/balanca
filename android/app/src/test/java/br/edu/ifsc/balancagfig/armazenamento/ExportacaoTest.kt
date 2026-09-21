package br.edu.ifsc.balancagfig.armazenamento

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Locale

/** Cobre a análise (NAR/métricas) e os exportadores CSV/JSON/.eng do backup. */
class ExportacaoTest {

    private var localeOriginal: Locale = Locale.getDefault()

    @Before fun setup() { localeOriginal = Locale.getDefault() }
    @After fun restaura() { Locale.setDefault(localeOriginal) }

    // Leituras: rampa 0→pico→0, em_queima quando força > 0.5; impulso trapezoidal.
    private fun leituras(pico: Double = 8.0, n: Int = 110, passoMs: Long = 10): JSONArray {
        val arr = JSONArray()
        var imp = 0.0
        var fAnt = 0.0
        for (i in 0 until n) {
            val t = i * passoMs
            val f = when {
                i < 5 -> 0.0
                i < 55 -> (i - 5) * (pico / 50)
                i < 105 -> pico - (i - 55) * (pico / 50)
                else -> 0.0
            }
            if (i > 0) imp += (fAnt + f) / 2 * (passoMs / 1000.0)
            fAnt = f
            arr.put(JSONObject().apply {
                put("marca_temporal", t)
                put("forca_crua", f)
                put("temperatura", JSONObject.NULL)
                put("em_queima", if (f > 0.5) 1 else 0)
                put("impulso_acumulado_ns", imp)
            })
        }
        return arr
    }

    private fun sessao(nome: String = "Teste B6", id: String = "abcdef12-3456-7890-aaaa-bbbbbbbbbbbb") =
        JSONObject().put("id", id).put("nome", nome).put("criado_em", "2026-09-17 10:00:00")

    private fun cabecalhoEng(eng: String): List<String> =
        eng.lineSequence().first { !it.startsWith(";") && !it.startsWith(" ") && it.isNotBlank() }
            .trim().split(Regex("\\s+"))

    // ─── Análise / NAR ────────────────────────────────────────────────────────

    @Test
    fun `classificacao NAR pelo impulso total aparece no eng`() {
        // pico 8 N por ~1 s → impulso ~4-5 N·s → classe C (5-10) ou B (2.5-5)
        val eng = Exportacao.eng(sessao(), null, leituras(pico = 8.0))
        val nome = cabecalhoEng(eng)[0]
        assertTrue("nome NAR: $nome", nome.startsWith("B") || nome.startsWith("C"))
    }

    @Test
    fun `sem leituras em queima gera curva minima valida`() {
        val semQueima = JSONArray().apply {
            for (i in 0 until 5) put(JSONObject().put("marca_temporal", i * 10L)
                .put("forca_crua", 0.1).put("temperatura", 0).put("em_queima", 0).put("impulso_acumulado_ns", 0))
        }
        val eng = Exportacao.eng(sessao(), null, semQueima)
        assertTrue(eng.trim().endsWith(";"))
        assertEquals(7, cabecalhoEng(eng).size)
    }

    // ─── .eng (RASP / OpenRocket) ─────────────────────────────────────────────

    @Test
    fun `eng tem cabecalho de 7 campos, dimensoes e massas positivas, delays P`() {
        val eng = Exportacao.eng(sessao(), null, leituras())
        val h = cabecalhoEng(eng)
        assertEquals(7, h.size)
        assertTrue(h[1].toDouble() > 0)                 // diâmetro
        assertTrue(h[2].toDouble() > 0)                 // comprimento
        assertEquals("P", h[3])                         // delays
        assertTrue(h[4].toDouble() > 0)                 // massa propelente
        assertTrue(h[5].toDouble() > h[4].toDouble())   // massa total > propelente
    }

    @Test
    fun `eng usa PONTO decimal mesmo com locale pt-BR (regressao do OpenRocket)`() {
        Locale.setDefault(Locale.forLanguageTag("pt-BR"))
        val eng = Exportacao.eng(sessao(), null, leituras())
        assertFalse("o .eng nao pode conter virgula decimal", eng.contains(","))
        // pontos de dados no formato "t f" com ponto
        val ponto = eng.lineSequence().first { it.startsWith("   ") }.trim()
        assertTrue(ponto.matches(Regex("\\d+\\.\\d+ \\d+\\.\\d+")))
    }

    @Test
    fun `eng respeita metadados informados`() {
        val meta = JSONObject().put("diametro_mm", 24).put("comprimento_mm", 70)
            .put("massa_propelente_g", 12).put("massa_total_g", 35).put("fabricante", "GFIG")
        val h = cabecalhoEng(Exportacao.eng(sessao(), meta, leituras()))
        assertEquals("24", h[1])
        assertEquals("70", h[2])
        assertEquals(0.012, h[4].toDouble(), 1e-4)
        assertEquals(0.035, h[5].toDouble(), 1e-4)
        assertEquals("GFIG", h[6])
    }

    @Test
    fun `eng primeiro ponto tem t maior que zero e ultimo empuxo zero`() {
        val dados = Exportacao.eng(sessao(), null, leituras()).lineSequence().filter { it.startsWith("   ") }.toList()
        assertTrue(dados.first().trim().split(Regex("\\s+"))[0].toDouble() > 0)
        assertEquals(0.0, dados.last().trim().split(Regex("\\s+"))[1].toDouble(), 0.0)
    }

    @Test
    fun `eng tempo estritamente crescente`() {
        val tempos = Exportacao.eng(sessao(), null, leituras()).lineSequence()
            .filter { it.startsWith("   ") }.map { it.trim().split(Regex("\\s+"))[0].toDouble() }.toList()
        for (i in 1 until tempos.size) assertTrue(tempos[i] > tempos[i - 1])
    }

    // ─── CSV ───────────────────────────────────────────────────────────────────

    @Test
    fun `csv tem cabecalho e uma linha por leitura`() {
        val ls = leituras(n = 20)
        val linhas = Exportacao.csv(ls).split("\n")
        assertEquals("tempo_relativo_s,forca_crua_newton,temperatura,em_queima,impulso_acumulado_ns", linhas[0])
        assertEquals(1 + 20, linhas.size)
    }

    @Test
    fun `csv de gravacao vazia sai so com o cabecalho`() {
        val linhas = Exportacao.csv(JSONArray()).split("\n")
        assertEquals(1, linhas.size)
        assertTrue(linhas[0].startsWith("tempo_relativo_s"))
    }

    // O marca_temporal é o millis() desde o boot do ESP. Um backup aberto meses
    // depois não tem como saber quando foi aquele boot — o arquivo precisa
    // trazer o tempo relativo ao início, como o CSV da tela e o .eng.
    @Test
    fun `csv conta o tempo a partir do inicio da gravacao`() {
        val ls = JSONArray().apply {
            for (i in 0 until 3) put(
                JSONObject().put("marca_temporal", 7_200_000L + i * 10L)
                    .put("forca_crua", 1.0).put("temperatura", JSONObject.NULL)
                    .put("em_queima", 0).put("impulso_acumulado_ns", 0),
            )
        }
        val tempos = Exportacao.csv(ls).split("\n").drop(1).map { it.split(",")[0] }
        assertEquals(listOf("0.0000000", "0.0100000", "0.0200000"), tempos)
    }

    // A origem é o MENOR tempo, não o primeiro: leitura fora de ordem é
    // possível, e o tempo não pode começar negativo.
    @Test
    fun `csv nao gera tempo negativo com leituras fora de ordem`() {
        val ls = JSONArray().apply {
            for (t in listOf(500L, 100L, 300L)) put(
                JSONObject().put("marca_temporal", t).put("forca_crua", 1.0)
                    .put("temperatura", JSONObject.NULL).put("em_queima", 0).put("impulso_acumulado_ns", 0),
            )
        }
        val tempos = Exportacao.csv(ls).split("\n").drop(1).map { it.split(",")[0].toDouble() }
        assertTrue("nenhum tempo pode ser negativo: $tempos", tempos.all { it >= 0.0 })
        assertTrue(tempos.contains(0.0))
    }

    // Campo separado por vírgula pede decimal com ponto: repetir o separador é
    // o que faz a planilha em português ler 0.012 como doze.
    @Test
    fun `csv usa ponto decimal e 7 casas mesmo com locale pt-BR`() {
        Locale.setDefault(Locale.forLanguageTag("pt-BR"))
        val primeira = Exportacao.csv(leituras(n = 3)).split("\n")[1]!!
        assertTrue("coluna de tempo: ${primeira.substringBefore(",")}",
            primeira.substringBefore(",").matches(Regex("\\d+\\.\\d{7}")))
    }

    // ─── JSON ──────────────────────────────────────────────────────────────────

    @Test
    fun `json traz sessao, analise e todas as leituras`() {
        val ls = leituras(n = 30)
        val obj = JSONObject(Exportacao.json(sessao("Motor X"), null, ls))
        assertEquals("Motor X", obj.getJSONObject("sessao").getString("nome"))
        assertTrue(obj.getJSONObject("analise").getDouble("impulsoTotal_Ns") > 0)
        assertEquals(30, obj.getJSONArray("leituras").length())
    }

    @Test
    fun `json usa ponto decimal e Isp so com massa informada`() {
        Locale.setDefault(Locale.forLanguageTag("pt-BR"))
        val semMassa = JSONObject(Exportacao.json(sessao(), null, leituras()))
        assertTrue(semMassa.getJSONObject("analise").isNull("impulsoEspecifico_s"))
        val comMassa = JSONObject(Exportacao.json(sessao(), JSONObject().put("massa_propelente_g", 12), leituras()))
        assertTrue(comMassa.getJSONObject("analise").getDouble("impulsoEspecifico_s") > 0)
    }
}
