package com.ifsc.laucherbox.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Cores semânticas com os mesmos valores do app da balança — lá elas também
 * são fixas, e não do tema.
 */
val CorOk = Color(0xFF81C784)
val CorAlerta = Color(0xFFFFB74D)
val CorErro = Color(0xFFE57373)

/** Cartão com título. Mesmo idioma visual do `Cartao` do app da balança. */
@Composable
fun Cartao(
    titulo: String,
    modifier: Modifier = Modifier,
    conteudo: @Composable ColumnScope.() -> Unit,
) {
    ElevatedCard(
        modifier = modifier,
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                titulo,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            conteudo()
        }
    }
}

/** Texto monoespaçado: MACs, IPs e caminhos alinham melhor assim. */
@Composable
fun Mono(texto: String, cor: Color? = null) {
    Text(
        texto,
        fontFamily = FontFamily.Monospace,
        style = MaterialTheme.typography.bodyMedium,
        color = cor ?: MaterialTheme.colorScheme.onSurface,
    )
}

/** Uma linha "rótulo — valor" com o valor em monoespaçado. */
@Composable
fun Linha(rotulo: String, valor: String, cor: Color? = null) {
    androidx.compose.foundation.layout.Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            rotulo,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Mono(valor, cor)
    }
}
