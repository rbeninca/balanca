package br.edu.ifsc.balancagfig.atualizacao

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReleaseTest {
    private fun release(tag: String, apk: Boolean = true, manifest: Boolean = true, draft: Boolean = false, pre: Boolean = false) = """
        {"tag_name":"$tag","draft":$draft,"prerelease":$pre,"body":"notas de $tag","assets":[
          ${if (apk) """{"name":"balancagfig-${tag.removePrefix("v")}.apk","browser_download_url":"https://x/$tag/app.apk"}""" else ""}
          ${if (apk && manifest) "," else ""}
          ${if (manifest) """{"name":"manifest.json","browser_download_url":"https://x/$tag/manifest.json"}""" else ""}
        ]}
    """.trimIndent()

    @Test
    fun leListaDeReleasesDoGitHub() {
        val json = "[${release("v2.4.0")},${release("v2.3.0", manifest = false)}]"
        val lista = Release.analisarLista(json)
        assertEquals(2, lista.size)
        assertEquals(Versao(2, 4, 0), lista[0].versao)
        assertEquals("https://x/v2.4.0/app.apk", lista[0].urlApk)
        assertEquals("https://x/v2.4.0/manifest.json", lista[0].urlManifesto)
        assertEquals("notas de v2.4.0", lista[0].notas)
        assertNull(lista[1].urlManifesto)
    }

    @Test
    fun ignoraRascunhoPreLancamentoSemApkETagNaoVersao() {
        val json = "[${release("v2.5.0", draft = true)},${release("v2.6.0", pre = true)},${release("v2.7.0", apk = false)},${release("firmware-V17")},${release("v2.8.0")}]"
        val lista = Release.analisarLista(json)
        assertEquals(listOf(Versao(2, 8, 0)), lista.map { it.versao })
    }

    @Test
    fun planoEhAMaisNovaEntreAsDisponiveis() {
        val releases = Release.analisarLista("[${release("v2.5.0")},${release("v2.3.0")},${release("v2.4.0")},${release("v2.5.0")},${release("v1.0.0")}]")
        val plano = PlanoAtualizacao.calcular(Versao(2, 3, 0), releases)
        assertEquals(listOf("2.5.0"), plano.map { it.versao.toString() })
        assertEquals(emptyList<Release>(), PlanoAtualizacao.calcular(Versao(2, 5, 0), releases))
    }

    @Test
    fun manifestoEIdaEVoltaDeRelease() {
        val m = Manifesto.deJson("""{"versao":"2.4.0","versionCode":5,"sha256":"ABC","tamanho":123}""")!!
        assertEquals(Versao(2, 4, 0), m.versao)
        assertEquals(5, m.versionCode)
        assertEquals("abc", m.sha256)
        assertEquals(123L, m.tamanho)

        val r = Release.analisarLista("[${release("v2.4.0")}]")[0]
        assertEquals(r, Release.deJson(r.paraJson()))
        val semManifesto = Release.analisarLista("[${release("v2.4.0", manifest = false)}]")[0]
        assertEquals(semManifesto, Release.deJson(semManifesto.paraJson()))
    }
}
