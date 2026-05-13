import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ResultadoAnalise } from '@balancagfig/analise';

export interface MetadadosPDF {
  nomeSessao?: string;
  data?: string;
  massaPropelente_g?: number;
}

// Gerador de PDF mínimo (raw bytes), compatível com browser e Node 18+
function criarPDFMinimo(texto: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const linhasConteudo = texto.map(t => `BT /F1 10 Tf 40 ${800 - texto.indexOf(t) * 14} Td (${t.replace(/[()\\]/g, '\\$&')}) Tj ET`);
  const streamConteudo = linhasConteudo.join('\n');

  const objetos: string[] = [];

  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objetos.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objetos.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj`);

  const streamBytes = encoder.encode(streamConteudo);
  objetos.push(`4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamConteudo}\nendstream\nendobj`);

  const header = '%PDF-1.4\n';
  const corpos = objetos.map(o => o + '\n');

  let offset = header.length;
  const offsets: number[] = [];
  for (const corpo of corpos) {
    offsets.push(offset);
    offset += corpo.length;
  }

  const xrefStart = offset;
  const xref = [
    'xref',
    `0 ${objetos.length + 1}`,
    '0000000000 65535 f \n',
    ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`),
  ].join('\n');

  const trailer = `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const pdfStr = header + corpos.join('') + xref + '\n' + trailer;
  return encoder.encode(pdfStr);
}

export function gerarPDF(
  leituras: LeituraProcessada[],
  analise: ResultadoAnalise,
  meta?: MetadadosPDF,
): Blob {
  const isp = analise.impulsoEspecifico_s;
  const ispTexto = isp != null
    ? `Isp: ${isp.toFixed(2)} s`
    : 'Isp: Aguardando massa propelente';

  const anomaliasCriticas = analise.anomalias.filter(a => a.nivel === 'CRITICO');

  const linhas = [
    `GFIG / IFSC Campus Gaspar`,
    `Relatorio de Ensaio de Motor`,
    ``,
    `Sessao: ${meta?.nomeSessao ?? '---'}`,
    `Data: ${meta?.data ?? '---'}`,
    ``,
    `Motor: ${analise.nomeComum}`,
    `Impulso total: ${analise.impulsoTotal_Ns.toFixed(3)} N.s`,
    `Forca maxima: ${analise.forcaPico_N.toFixed(3)} N`,
    `Forca media: ${analise.forcaMedia_N.toFixed(3)} N`,
    `Duracao queima: ${analise.duracaoQueima_s.toFixed(3)} s`,
    ispTexto,
    `Perfil de queima: ${analise.perfilQueima}`,
    ``,
    anomaliasCriticas.length > 0
      ? `ATENCAO: ${anomaliasCriticas.length} anomalia(s) CRITICO detectada(s)`
      : `Sem anomalias criticas`,
    ...analise.anomalias.map(a => `  [${a.nivel}] ${a.tipo}`),
  ];

  const bytes = criarPDFMinimo(linhas);
  return new Blob([bytes], { type: 'application/pdf' });
}
