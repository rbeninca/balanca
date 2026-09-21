package br.edu.ifsc.balancagfig.armazenamento

import org.json.JSONArray
import org.json.JSONObject

/**
 * Gera CSV, JSON e .eng de uma sessão a partir das linhas do banco, para o
 * backup em pendrive. Portes fiéis de pacotes/relatorio e pacotes/analise
 * (classificação NAR, métricas de queima e formato RASP).
 */
object Exportacao {

    /** Uma leitura como vem do banco (colunas de `leituras`). */
    private class Leitura(o: JSONObject) {
        val t: Long = o.optLong("marca_temporal")
        val f: Double = o.optDouble("forca_crua", 0.0)
        val temp: Double = if (o.isNull("temperatura")) 0.0 else o.optDouble("temperatura", 0.0)
        val emQueima: Boolean = o.optLong("em_queima") != 0L
        val impulso: Double = o.optDouble("impulso_acumulado_ns", 0.0)
    }

    /** Métricas essenciais (subconjunto de ResultadoAnalise) + classificação NAR. */
    private class Analise(leituras: List<Leitura>, massaPropelenteG: Double?) {
        val impulsoTotal: Double
        val forcaPico: Double
        val forcaMedia: Double
        val duracaoQueima: Double
        val nomeComum: String
        val letra: String
        val isp: Double?
        val temQueima: Boolean

        init {
            val q = leituras.filter { it.emQueima }
            temQueima = q.isNotEmpty()
            if (q.isEmpty()) {
                impulsoTotal = 0.0; forcaPico = 0.0; forcaMedia = 0.0; duracaoQueima = 0.0
                letra = "?"; nomeComum = "?"; isp = null
            } else {
                val forcas = q.map { it.f }
                forcaPico = forcas.max()
                forcaMedia = forcas.average()
                impulsoTotal = q.last().impulso - q.first().impulso
                duracaoQueima = (q.last().t - q.first().t) / 1000.0
                letra = classeNar(impulsoTotal)
                nomeComum = "$letra${"%.1f".format(java.util.Locale.US, forcaMedia)}"
                isp = massaPropelenteG?.takeIf { it > 0 }?.let { impulsoTotal / ((it / 1000.0) * G0) }
            }
        }
    }

    private const val G0 = 9.80665

    // Faixas NAR (ClassificadorNAR.ts): impulsoNs em (min, max]
    private val CLASSES_NAR = listOf(
        "1/8A" to 0.3125, "1/4A" to 0.625, "1/2A" to 1.25, "A" to 2.50, "B" to 5.00,
        "C" to 10.0, "D" to 20.0, "E" to 40.0, "F" to 80.0, "G" to 160.0, "H" to 320.0,
        "I" to 640.0, "J" to 1280.0, "K" to 2560.0, "L" to 5120.0, "M" to 10240.0,
        "N" to 20480.0, "O" to 40960.0,
    )

    private fun classeNar(impulso: Double): String {
        var min = 0.0
        for ((letra, max) in CLASSES_NAR) {
            if (impulso > min && impulso <= max) return letra
            min = max
        }
        return "?"
    }

    // ─── CSV ─────────────────────────────────────────────────────────────────

    /**
     * CSV do backup, no mesmo tempo dos outros arquivos que o app gera: segundos
     * relativos ao início da gravação.
     *
     * Antes saía o `marca_temporal` cru — o `millis()` desde o boot do ESP. Um
     * backup aberto meses depois não tem como saber quando foi aquele boot, e a
     * coluna obrigava quem lesse a fazer a conta de cabeça. O nome da coluna
     * mudou junto: chamar de `marca_temporal` um tempo relativo seria mentira.
     *
     * Sete casas, como no CSV da tela e no CURVA EMPUXO. A resolução real é de
     * 1 ms — as 4 últimas casas são sempre zero, alinhando o campo com os
     * outros arquivos.
     *
     * Ponto decimal, e não vírgula: o separador de campo é a vírgula. Repetir o
     * mesmo separador é o que faz a planilha em português ler `0.012` como doze.
     */
    fun csv(leiturasJson: JSONArray): String {
        val leituras = (0 until leiturasJson.length()).map { leiturasJson.getJSONObject(it) }
        val t0 = leituras.minOfOrNull { it.optLong("marca_temporal") } ?: 0L

        val sb = StringBuilder("tempo_relativo_s,forca_crua_newton,temperatura,em_queima,impulso_acumulado_ns")
        for (l in leituras) {
            val t = (l.optLong("marca_temporal") - t0) / 1000.0
            sb.append('\n')
                .append("%.7f".format(java.util.Locale.US, t)).append(',')
                .append(l.optDouble("forca_crua", 0.0)).append(',')
                .append(if (l.isNull("temperatura")) "" else l.optDouble("temperatura").toString()).append(',')
                .append(l.optLong("em_queima")).append(',')
                .append(l.optDouble("impulso_acumulado_ns", 0.0))
        }
        return sb.toString()
    }

    // ─── JSON ────────────────────────────────────────────────────────────────

    /** Sessão + metadados + leituras + análise essencial (para reimportar/reanalisar). */
    fun json(sessao: JSONObject, meta: JSONObject?, leiturasJson: JSONArray): String {
        val leituras = (0 until leiturasJson.length()).map { Leitura(leiturasJson.getJSONObject(it)) }
        val massaProp = meta?.optDoubleOrNull("massa_propelente_g")
        val a = Analise(leituras, massaProp)

        val arr = JSONArray()
        for (l in leituras) {
            arr.put(JSONObject().put("t", l.t).put("f", l.f).put("tc", l.temp).put("q", l.emQueima).put("i", l.impulso))
        }
        return JSONObject().apply {
            put("versaoFormato", "2.0-host")
            put("sessao", JSONObject().apply {
                put("id", sessao.optString("id"))
                put("nome", sessao.optString("nome"))
                put("data", sessao.optString("criado_em"))
                put("id_motor", sessao.opt("id_motor") ?: JSONObject.NULL)
                put("observacoes", sessao.opt("observacoes") ?: JSONObject.NULL)
            })
            if (meta != null) put("metadados", meta)
            put("analise", JSONObject().apply {
                put("nomeComum", a.nomeComum)
                put("letraMotor", a.letra)
                put("impulsoTotal_Ns", a.impulsoTotal)
                put("forcaPico_N", a.forcaPico)
                put("forcaMedia_N", a.forcaMedia)
                put("duracaoQueima_s", a.duracaoQueima)
                put("impulsoEspecifico_s", a.isp ?: JSONObject.NULL)
            })
            put("leituras", arr)
        }.toString(2)
    }

    // ─── .eng (RASP / OpenRocket) ─────────────────────────────────────────────

    fun eng(sessao: JSONObject, meta: JSONObject?, leiturasJson: JSONArray): String {
        val leituras = (0 until leiturasJson.length()).map { Leitura(leiturasJson.getJSONObject(it)) }
        val massaProp = meta?.optDoubleOrNull("massa_propelente_g")
        val a = Analise(leituras, massaProp)

        val nome = (a.nomeComum.takeIf { it != "?" } ?: sessao.optString("nome", "Motor")).replace(Regex("\\s+"), "_")
        val fabricante = (meta?.optStringOrNull("fabricante") ?: "GFIG").replace(Regex("\\s+"), "_")

        val diamInf = meta?.optDoubleOrNull("diametro_mm")
        val compInf = meta?.optDoubleOrNull("comprimento_mm")
        val massaTotInf = meta?.optDoubleOrNull("massa_total_g")

        val diametro = diamInf?.takeIf { it > 0 } ?: DIAMETRO_PADRAO_MM
        val comprimento = compInf?.takeIf { it > 0 } ?: COMPRIMENTO_PADRAO_MM
        val massaPropG = massaProp?.takeIf { it > 0 } ?: maxOf(1.0, a.impulsoTotal / (ISP_ESTIMADO_S * G0) * 1000)
        val massaTotG = massaTotInf?.takeIf { it > massaPropG } ?: (massaPropG * 2)
        val estimados = (diamInf ?: 0.0) <= 0.0 || (compInf ?: 0.0) <= 0.0 ||
            (massaProp ?: 0.0) <= 0.0 || (massaTotInf ?: 0.0) <= 0.0

        val linhas = mutableListOf(
            "; Gerado por balancaGFIG",
            "; Motor: $nome",
            "; Impulso total: ${"%.3f".format(java.util.Locale.US, a.impulsoTotal)} Ns",
            "; Forca maxima: ${"%.3f".format(java.util.Locale.US, a.forcaPico)} N",
            "; Duracao: ${"%.3f".format(java.util.Locale.US, a.duracaoQueima)} s",
            if (a.isp != null) "; Isp: ${"%.2f".format(java.util.Locale.US, a.isp)} s" else "; Isp: massa propelente nao informada",
        )
        if (estimados) linhas += "; ATENCAO: diametro/comprimento/massa estimados - ajuste os valores reais no OpenRocket"
        linhas += "$nome ${"%.0f".format(java.util.Locale.US, diametro)} ${"%.0f".format(java.util.Locale.US, comprimento)} P " +
            "${"%.4f".format(java.util.Locale.US, massaPropG / 1000)} ${"%.4f".format(java.util.Locale.US, massaTotG / 1000)} $fabricante"

        val q = leituras.filter { it.emQueima }
        if (q.isEmpty()) {
            linhas += "   0.0010 0.000"; linhas += ";"
            return linhas.joinToString("\n")
        }
        val tZero = q.first().t - 1
        var tAnt = 0.0
        for (l in q) {
            val t = (l.t - tZero) / 1000.0
            if (t <= tAnt) continue
            linhas += "   ${"%.4f".format(java.util.Locale.US, t)} ${"%.3f".format(java.util.Locale.US, maxOf(0.0, l.f))}"
            tAnt = t
        }
        linhas += "   ${"%.4f".format(java.util.Locale.US, (q.last().t - tZero) / 1000.0 + 0.01)} 0.000"
        linhas += ";"
        return linhas.joinToString("\n")
    }

    private const val DIAMETRO_PADRAO_MM = 29.0
    private const val COMPRIMENTO_PADRAO_MM = 70.0
    private const val ISP_ESTIMADO_S = 100.0

    private fun JSONObject.optDoubleOrNull(k: String): Double? =
        if (has(k) && !isNull(k)) optDouble(k).takeUnless { it.isNaN() } else null
    private fun JSONObject.optStringOrNull(k: String): String? =
        if (has(k) && !isNull(k)) optString(k).takeIf { it.isNotBlank() } else null
}
