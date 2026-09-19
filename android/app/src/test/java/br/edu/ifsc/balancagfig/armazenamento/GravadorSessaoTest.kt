package br.edu.ifsc.balancagfig.armazenamento

import br.edu.ifsc.balancagfig.processamento.LeituraProcessada
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GravadorSessaoTest {

    private class DestinoFalso : GravadorSessao.Destino {
        val sessoes = ArrayList<Pair<String, String>>()
        val inseridas = HashMap<String, MutableList<LeituraProcessada>>()
        val finalizadas = ArrayList<String>()
        override fun criarSessao(nome: String): String = "s${sessoes.size + 1}".also { sessoes += it to nome }
        override fun inserir(idSessao: String, lote: List<LeituraProcessada>) { inseridas.getOrPut(idSessao) { ArrayList() } += lote }
        override fun finalizar(idSessao: String) { finalizadas += idSessao }
    }

    private fun leitura(t: Long, f: Double = 1.0) = LeituraProcessada(t, f, 0.0, false, 0.0, f, null)

    private fun criar(destino: DestinoFalso, mudancas: MutableList<GravadorSessao.EstadoGravacao> = ArrayList(), lote: Int = 3) =
        GravadorSessao(destino, aoMudar = { mudancas += it }, agora = { 1_000L }, tamanhoLote = lote)

    @Test
    fun foraDeGravacaoLeiturasSaoIgnoradas() {
        val d = DestinoFalso()
        val g = criar(d)
        g.receber(leitura(1)); g.receber(leitura(2))
        assertTrue(d.inseridas.isEmpty())
        assertFalse(g.estado.gravando)
        assertNull(g.parar("x"))
    }

    @Test
    fun gravaEmLotesEDescarregaORestoAoParar() {
        val d = DestinoFalso()
        val mudancas = ArrayList<GravadorSessao.EstadoGravacao>()
        val g = criar(d, mudancas, lote = 3)

        assertTrue(g.iniciar("Motor A", "192.168.43.10"))
        assertEquals(listOf("s1" to "Motor A"), d.sessoes)
        assertTrue(g.estado.gravando)
        assertEquals("192.168.43.10", g.estado.iniciadaPor)
        assertEquals(1_000L, g.estado.inicioMs)

        for (t in 1L..7L) g.receber(leitura(t))
        assertEquals(6, d.inseridas["s1"]!!.size)     // dois lotes de 3; a 7ª fica no buffer
        assertEquals(7L, g.estado.amostras)

        val fim = g.parar("192.168.43.11")
        assertNotNull(fim)
        assertEquals(7, d.inseridas["s1"]!!.size)
        assertEquals(listOf("s1"), d.finalizadas)
        assertEquals("Motor A", fim!!.nome)
        assertEquals(7L, fim.amostras)
        assertEquals("192.168.43.11", fim.paradaPor)

        assertFalse(g.estado.gravando)
        assertEquals(fim, g.estado.ultima)
        assertEquals(2, mudancas.size)   // iniciar e parar (o contador periódico é do serviço)
    }

    @Test
    fun segundoIniciarEhRecusadoEnquantoGrava() {
        val d = DestinoFalso()
        val g = criar(d)
        assertTrue(g.iniciar("A", "c1"))
        assertFalse(g.iniciar("B", "c2"))
        assertEquals(1, d.sessoes.size)
        assertEquals("A", g.estado.nome)
        assertEquals("c1", g.estado.iniciadaPor)
    }

    @Test
    fun qualquerClientePodeParar() {
        val d = DestinoFalso()
        val g = criar(d)
        g.iniciar("A", "c1")
        val fim = g.parar("c2")!!
        assertEquals("c2", fim.paradaPor)
        assertTrue(g.iniciar("B", "c2"))   // nova gravação depois de parar
        assertEquals("A", g.estado.ultima!!.nome)  // 'ultima' sobrevive ao novo início
    }

    @Test
    fun nomeVazioGanhaNomePadraoComData() {
        val d = DestinoFalso()
        val g = criar(d)
        g.iniciar("   ", "c1")
        assertTrue(g.estado.nome!!.startsWith("Sessão "))
    }

    @Test
    fun estadoSerializaParaOFrontend() {
        val d = DestinoFalso()
        val g = criar(d)
        val vazio = g.estado.paraJson()
        assertFalse(vazio.getBoolean("gravando"))
        assertTrue(vazio.isNull("idSessao"))
        assertTrue(vazio.isNull("ultima"))

        g.iniciar("A", "c1"); g.receber(leitura(1)); g.parar("c2")
        val j = g.estado.paraJson()
        assertFalse(j.getBoolean("gravando"))
        val ultima = j.getJSONObject("ultima")
        assertEquals("s1", ultima.getString("id"))
        assertEquals(1L, ultima.getLong("amostras"))
        assertEquals("c2", ultima.getString("paradaPor"))
    }
}
