/**
 * Conferência da chave do painel.
 *
 * Comparação byte a byte, sem parar no primeiro diferente: comparar strings com
 * `===` sai mais cedo quanto mais cedo elas divergem, e esse tempo, medido de
 * fora, conta a chave dígito por dígito. Aqui o laço sempre percorre tudo.
 *
 * A chave é a mesma que vai embutida no APK: quem tiver o APK na mão tem a
 * chave. Ela desencoraja — não é segredo forte, e o LEIA-ME diz isso.
 */
export function iguais(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  // O tamanho aparece; o conteúdo, não. Sem isto, comparar chaves de tamanhos
  // diferentes seria um caso à parte e mais rápido de distinguir.
  if (bytesA.length !== bytesB.length) return false;
  let diferenca = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diferenca |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diferenca === 0;
}
