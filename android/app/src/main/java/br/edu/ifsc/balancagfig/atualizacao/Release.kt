package br.edu.ifsc.balancagfig.atualizacao

import org.json.JSONArray
import org.json.JSONObject

/**
 * Uma versão publicada em GitHub Releases pelo workflow release.yml:
 * tag `vX.Y.Z` com os assets `balancagfig-X.Y.Z.apk` e `manifest.json`.
 */
data class Release(
    val versao: Versao,
    val tag: String,
    val urlApk: String,
    val urlManifesto: String?,
    val notas: String,
) {
    fun paraJson(): JSONObject = JSONObject()
        .put("versao", versao.toString())
        .put("tag", tag)
        .put("url_apk", urlApk)
        .put("url_manifesto", urlManifesto ?: JSONObject.NULL)
        .put("notas", notas)

    companion object {
        fun deJson(o: JSONObject): Release? {
            val versao = Versao.analisar(o.optString("versao")) ?: return null
            return Release(
                versao = versao,
                tag = o.optString("tag"),
                urlApk = o.optString("url_apk"),
                urlManifesto = o.optString("url_manifesto").takeIf { it.isNotEmpty() && !o.isNull("url_manifesto") },
                notas = o.optString("notas"),
            )
        }

        /**
         * Lê a resposta de GET /repos/{dono}/{repo}/releases. Ignora rascunhos,
         * pré-lançamentos, tags que não são versão e releases sem APK.
         */
        fun analisarLista(json: String): List<Release> {
            val lista = JSONArray(json)
            val saida = ArrayList<Release>()
            for (i in 0 until lista.length()) {
                val r = lista.optJSONObject(i) ?: continue
                if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue
                val versao = Versao.analisar(r.optString("tag_name")) ?: continue
                val assets = r.optJSONArray("assets") ?: continue
                var urlApk: String? = null
                var urlManifesto: String? = null
                for (j in 0 until assets.length()) {
                    val a = assets.optJSONObject(j) ?: continue
                    val nome = a.optString("name")
                    val url = a.optString("browser_download_url")
                    when {
                        nome.endsWith(".apk", ignoreCase = true) -> urlApk = url
                        nome == "manifest.json" -> urlManifesto = url
                    }
                }
                saida += Release(versao, r.optString("tag_name"), urlApk ?: continue, urlManifesto, r.optString("body"))
            }
            return saida
        }
    }
}

/**
 * Conteúdo do asset manifest.json de uma release.
 *
 * [estavel] é o portão das releases: a partir da 2.8.5 o app só instala o que
 * declara `"estavel": true`. O padrão é fechado de propósito — release sem o
 * campo (as de antes da 2.8.5, e as publicadas à mão sem manifest) fica de
 * fora. Clientes até a 2.8.4 não conhecem o campo e continuam instalando
 * qualquer release mais nova; a proteção deles é a flag `prerelease` do GitHub
 * ([Release.analisarLista]) mais a instalação por ADB.
 */
data class Manifesto(
    val versao: Versao,
    val versionCode: Int,
    val sha256: String,
    val tamanho: Long,
    val estavel: Boolean,
) {
    companion object {
        fun deJson(json: String): Manifesto? {
            val o = JSONObject(json)
            val versao = Versao.analisar(o.optString("versao")) ?: return null
            return Manifesto(
                versao = versao,
                versionCode = o.optInt("versionCode"),
                sha256 = o.optString("sha256").lowercase(),
                tamanho = o.optLong("tamanho"),
                estavel = o.optBoolean("estavel"),
            )
        }
    }
}
