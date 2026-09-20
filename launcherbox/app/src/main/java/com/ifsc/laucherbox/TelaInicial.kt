package com.ifsc.laucherbox

import android.content.Context
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Image
import com.ifsc.laucherbox.dados.AppAbrivel
import com.ifsc.laucherbox.dados.AppsInstalados
import com.ifsc.laucherbox.dados.Armazenamento
import com.ifsc.laucherbox.dados.ColetaRoot
import com.ifsc.laucherbox.dados.ConfigHotspot
import com.ifsc.laucherbox.dados.Hotspot
import com.ifsc.laucherbox.dados.InterfaceRede
import com.ifsc.laucherbox.dados.InterfacesRede
import com.ifsc.laucherbox.dados.Volume
import com.ifsc.laucherbox.sistema.Root
import com.ifsc.laucherbox.ui.Cartao
import com.ifsc.laucherbox.ui.CorAlerta
import com.ifsc.laucherbox.ui.CorErro
import com.ifsc.laucherbox.ui.CorOk
import com.ifsc.laucherbox.ui.Linha
import com.ifsc.laucherbox.ui.Mono
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** Tudo que a tela mostra, num retrato do momento. */
data class EstadoBox(
    val apps: List<AppAbrivel> = emptyList(),
    val redes: List<InterfaceRede> = emptyList(),
    val volumes: List<Volume> = emptyList(),
    val hotspot: ConfigHotspot = ConfigHotspot(false, null, null),
    val temRoot: Boolean = true,
)

private const val TAG = "LauncherBox"

/** De quanto em quanto tempo a tela se atualiza. */
private const val INTERVALO_MS = 3_000L

/** A cada quantas atualizações reconferimos o root e relemos o que depende dele. */
private const val CICLOS_ENTRE_LEITURA_ROOT = 5

@Composable
fun TelaInicial(contexto: Context) {
    var estado by remember { mutableStateOf(EstadoBox()) }
    var rootCacheado by remember { mutableStateOf<Boolean?>(null) }
    var ciclos by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            // Uma exceção aqui dentro mataria este laço e a tela ficaria vazia
            // para sempre — sem nenhum sinal de que parou de atualizar.
            runCatching {
                val lerRoot = rootCacheado == null || ciclos % CICLOS_ENTRE_LEITURA_ROOT == 0
                val retrato = withContext(Dispatchers.IO) {
                    coletar(contexto, rootCacheado, lerRoot, estado)
                }
                estado = retrato
                rootCacheado = retrato.temRoot
                ciclos++
            }.onFailure { Log.w(TAG, "coleta falhou: ${it.message}") }
            delay(INTERVALO_MS)
        }
    }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Image(
                painter = painterResource(R.drawable.logo_projeto),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                // Cabeçalho enxuto de propósito: com 720p de altura, cada
                // pixel aqui é um pixel que falta lá embaixo — e a senha do
                // hotspot precisa aparecer sem rolagem
                modifier = Modifier.height(78.dp),
            )
        }

        Spacer(Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Cartao("APLICATIVOS", Modifier.weight(1f).fillMaxHeight()) {
                ListaDeApps(estado.apps) { app ->
                    AppsInstalados.abrir(contexto, app)
                }
            }

            // rolagem: com 720p de altura os três cartões não cabem sempre —
            // num pendrive plugado, por exemplo, a lista de disco cresce
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Cartao("REDE", Modifier.fillMaxWidth()) {
                    CartaoRede(estado)
                }
                Cartao("ARMAZENAMENTO", Modifier.fillMaxWidth()) {
                    CartaoDisco(estado)
                }
                Cartao("HOTSPOT", Modifier.fillMaxWidth()) {
                    CartaoHotspot(estado)
                }
            }
        }
    }
}

// ── coleta ──────────────────────────────────────────────────────────────────

/**
 * O retrato da tela.
 *
 * Cada fonte é isolada: uma exceção em qualquer ponto deixava a tela com "—" em
 * tudo, sem dizer por quê.
 *
 * O que depende de root só é relido quando [lerRoot] — a cada
 * [CICLOS_ENTRE_LEITURA_ROOT] ciclos, não a cada um. Não é economia boba: cada
 * `su` no SuperSU sobe uma VM e leva cerca de um minuto para sair, então quatro
 * por ciclo a cada 3 s deixavam ~80 processos `app_process` vivos e o load em
 * 24 num box de quatro núcleos. Nos ciclos intermediários a tela reaproveita o
 * que já tinha; só o estado do AP é reconferido, porque vem por reflexão e é
 * barato.
 */
private fun coletar(
    contexto: Context,
    rootConhecido: Boolean?,
    lerRoot: Boolean,
    anterior: EstadoBox,
): EstadoBox {
    fun <T> ler(fonte: () -> T, padrao: T): T = runCatching(fonte)
        .onFailure { Log.w(TAG, "fonte falhou: ${it.message}") }
        .getOrDefault(padrao)

    val aplicativos = ler({ AppsInstalados.listar(contexto) }, anterior.apps)
    val temRoot = if (rootConhecido == null) ler({ Root.disponivel() }, false) else rootConhecido

    if (!temRoot || !lerRoot) {
        return anterior.copy(
            apps = aplicativos,
            temRoot = temRoot,
            hotspot = anterior.hotspot.copy(
                ligado = ler({ Hotspot.estaLigado(contexto) }, anterior.hotspot.ligado),
            ),
        )
    }

    val bruto = ler({ ColetaRoot.coletar() }, null)
        ?: return anterior.copy(apps = aplicativos, temRoot = temRoot)

    return EstadoBox(
        apps = aplicativos,
        redes = ler({ InterfacesRede.listar(bruto.links, bruto.enderecos) }, emptyList()),
        volumes = ler({ Armazenamento.listar(bruto.disco) }, emptyList()),
        hotspot = ler(
            { Hotspot.ler(contexto, bruto.softap) },
            ConfigHotspot(false, null, null),
        ),
        temRoot = temRoot,
    )
}

// ── pedaços da tela ─────────────────────────────────────────────────────────

/**
 * Os apps que aparecem sempre, sem precisar expandir: o da balança e as
 * configurações do Android. O resto do box é ruído para quem opera a balança —
 * fica atrás do "mais" para não competir por atenção nem por espaço.
 */
private fun ehFixo(pacote: String): Boolean =
    pacote == "br.edu.ifsc.balancagfig" ||
        pacote == "com.android.settings" ||
        pacote == "com.android.tv.settings" ||
        pacote.endsWith(".settings")

@Composable
private fun ListaDeApps(apps: List<AppAbrivel>, aoAbrir: (AppAbrivel) -> Unit) {
    if (apps.isEmpty()) {
        Text("nenhum app instalado", color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }

    // O estado de expansão sobrevive às atualizações de 3 em 3 s: fica no
    // remember, não no retrato que vem da coleta.
    var mostrarTodos by remember { mutableStateOf(false) }

    val fixos = apps.filter { ehFixo(it.pacote) }
    val resto = apps.filterNot { ehFixo(it.pacote) }
    val visiveis = if (mostrarTodos) fixos + resto else fixos

    LazyColumn(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        items(visiveis, key = { it.pacote }) { app -> LinhaDeApp(app, aoAbrir) }
        if (resto.isNotEmpty()) {
            item {
                LinhaDeMais(expandido = mostrarTodos, quantos = resto.size) {
                    mostrarTodos = !mostrarTodos
                }
            }
        }
    }
}

/** A linha que abre e fecha o resto da lista. */
@Composable
private fun LinhaDeMais(expandido: Boolean, quantos: Int, aoTocar: () -> Unit) {
    var focado by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (focado) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
            )
            .focusable()
            .onFocusChanged { focado = it.isFocused }
            .clickable { aoTocar() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (expandido) "menos" else "mais ($quantos)",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun LinhaDeApp(app: AppAbrivel, aoAbrir: (AppAbrivel) -> Unit) {
    var focado by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (focado) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
            )
            .focusable()
            .onFocusChanged { focado = it.isFocused }
            .clickable { aoAbrir(app) }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // ícone do app; se não veio, a linha continua só com o texto
        app.icone?.let { icone ->
            Image(
                bitmap = icone,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
            )
        }
        Text(
            app.rotulo,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (focado) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
            modifier = Modifier.weight(1f, fill = false),
        )
        Text(
            app.pacote,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

@Composable
private fun CartaoRede(estado: EstadoBox) {
    if (estado.redes.isEmpty()) {
        Text(
            if (estado.temRoot) "—" else "sem root",
            color = if (estado.temRoot) MaterialTheme.colorScheme.onSurfaceVariant else CorAlerta,
        )
        return
    }
    estado.redes.forEach { rede ->
        Column {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    rede.nome,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (rede.noAr) CorOk else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Mono(rede.ip ?: "—")
            }
            Mono(rede.mac ?: "—", MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CartaoDisco(estado: EstadoBox) {
    if (estado.volumes.isEmpty()) {
        Text(
            if (estado.temRoot) "—" else "sem root",
            color = if (estado.temRoot) MaterialTheme.colorScheme.onSurfaceVariant else CorAlerta,
        )
        return
    }
    estado.volumes.forEach { v ->
        Linha(
            rotulo = v.ponto,
            valor = "${v.livre} livres · ${v.percentual}",
            cor = when {
                v.critico -> CorErro
                v.percentual.removeSuffix("%").toIntOrNull()?.let { it >= 75 } == true -> CorAlerta
                else -> null
            },
        )
    }
}

@Composable
private fun CartaoHotspot(estado: EstadoBox) {
    val h = estado.hotspot
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (h.ligado) "ligado" else "desligado",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = if (h.ligado) CorOk else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!estado.temRoot) Text("(sem root: sem nome/senha)", color = CorAlerta)
    }
    Linha("rede", h.ssid ?: "—")
    Linha("senha", h.senha ?: "—")
}
