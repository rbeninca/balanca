package br.edu.ifsc.balancagfig.processamento

import br.edu.ifsc.balancagfig.protocolo.PacoteDados
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Equivalência TS ↔ Kotlin (Fase 0 do PLANEJAMENTO-PROCESSAMENTO.MD): reproduz
 * os golden files gerados por pacotes/processamento/testes/pipeline/
 * PipelineGolden.teste.ts. Tolerância 1e-9 para FIR/mediana e 1e-6 para os
 * IIR (Notch, EMA, Kalman), onde a ordem das operações em ponto flutuante
 * pode diferir entre as duas linguagens.
 */
class PipelineGoldenTest {

    private val pasta = File("../../pacotes/processamento/testes/fixtures/pipeline")

    private fun lerPatch(o: JSONObject) = PipelinePatch(
        limiarZonaMortaN = o.optDoubleOrNull("limiarZonaMortaN"),
        janelaMediaMovel = o.optIntOrNull("janelaMediaMovel"),
        fatorCalibracao = o.optDoubleOrNull("fatorCalibracao"),
        deslocamentoTara = o.optDoubleOrNull("deslocamentoTara"),
        tempoMinFimMs = o.optIntOrNull("tempoMinFimMs")?.toLong(),
        janelaMediana = o.optIntOrNull("janelaMediana"),
        alphaEMA = o.optDoubleOrNull("alphaEMA"),
        freqNotchHz = o.optDoubleOrNull("freqNotchHz"),
        qNotch = o.optDoubleOrNull("qNotch"),
        taxaAmostragemHz = o.optDoubleOrNull("taxaAmostragemHz"),
        janelaSG = o.optIntOrNull("janelaSG"),
        kalmanQ = o.optDoubleOrNull("kalmanQ"),
        kalmanR = o.optDoubleOrNull("kalmanR"),
        ativoZonaMorta = o.optBooleanOrNull("ativoZonaMorta"),
        ativoMediaMovel = o.optBooleanOrNull("ativoMediaMovel"),
        ativoDetectorQueima = o.optBooleanOrNull("ativoDetectorQueima"),
        ativoMediana = o.optBooleanOrNull("ativoMediana"),
        ativoEMA = o.optBooleanOrNull("ativoEMA"),
        ativoNotch = o.optBooleanOrNull("ativoNotch"),
        ativoSG = o.optBooleanOrNull("ativoSG"),
        ativoKalman = o.optBooleanOrNull("ativoKalman"),
        filtroPrincipal = FiltroPrincipal.deValor(if (o.has("filtroPrincipal")) o.getString("filtroPrincipal") else null),
    )

    private fun JSONObject.optDoubleOrNull(k: String) = if (has(k) && !isNull(k)) getDouble(k) else null
    private fun JSONObject.optIntOrNull(k: String) = if (has(k) && !isNull(k)) getInt(k) else null
    private fun JSONObject.optBooleanOrNull(k: String) = if (has(k) && !isNull(k)) getBoolean(k) else null

    private fun tolerancia(patch: PipelinePatch): Double =
        if (patch.ativoNotch == true || patch.ativoEMA == true || patch.ativoKalman == true ||
            patch.filtroPrincipal == FiltroPrincipal.EMA || patch.filtroPrincipal == FiltroPrincipal.KALMAN) 1e-6 else 1e-9

    private fun reproduzir(arquivo: File) {
        val fx = JSONObject(arquivo.readText())
        val cb = fx.getJSONObject("configBase")
        val patch = lerPatch(fx.getJSONObject("patch"))
        val p = PipelineProcessamento(
            ConfiguracaoPipeline(
                limiarZonaMortaN = cb.getDouble("limiarZonaMortaN"), janelaMediaMovel = cb.getInt("janelaMediaMovel"),
                fatorCalibracao = cb.getDouble("fatorCalibracao"), deslocamentoTara = cb.getDouble("deslocamentoTara"),
                tempoMinFimMs = cb.getLong("tempoMinFimMs"), taxaAmostragemHz = cb.optDoubleOrNull("taxaAmostragemHz"),
            )
        )
        p.atualizarConfig(patch)
        val tol = tolerancia(patch)
        val entrada = fx.getJSONArray("entrada")
        val saida = fx.getJSONArray("saida")
        assertEquals(entrada.length(), saida.length())
        for (i in 0 until entrada.length()) {
            val e = entrada.getJSONObject(i)
            val esperado = saida.getJSONObject(i)
            // No fio a força é float32: o JSON traz o double do fround, e toFloat() é exato para ele
            val r = p.processar(PacoteDados(e.getLong("t"), e.getDouble("f").toFloat(), 0, 0))
            val ctx = "${arquivo.nameWithoutExtension}[$i]"
            assertEquals("$ctx emQueima", esperado.getBoolean("emQueima"), r.emQueima)
            assertEquals("$ctx forcaNewton", esperado.getDouble("forcaNewton"), r.forcaNewton, tol)
            assertEquals("$ctx impulso", esperado.getDouble("impulsoAcumuladoNs"), r.impulsoAcumuladoNs, tol * 10)
            assertEquals("$ctx crua", esperado.getDouble("forcaNewtonCrua"), r.forcaNewtonCrua, 0.0)
            if (esperado.isNull("forcaNewtonBruta")) assertEquals("$ctx bruta", null, r.forcaNewtonBruta)
            else assertEquals("$ctx bruta", esperado.getDouble("forcaNewtonBruta"), r.forcaNewtonBruta!!, 0.0)
        }
    }

    @Test
    fun reproduzTodosOsGoldenFilesDoTypeScript() {
        val arquivos = pasta.listFiles { f -> f.extension == "json" }?.sortedBy { it.name } ?: emptyList()
        assertTrue("nenhum golden file em $pasta — rode os testes do pacote processamento", arquivos.size >= 9)
        for (a in arquivos) reproduzir(a)
    }
}
