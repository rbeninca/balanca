import { describe, it, expect } from 'vitest';
import { gerarPDF } from '../src/GeradorPDF.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ResultadoAnalise } from '@balancagfig/analise';

const analise: ResultadoAnalise = {
  impulsoTotal_Ns: 2.94,
  forcaPico_N: 3.0,
  forcaMedia_N: 1.73,
  forcaRms_N: 1.8,
  coefVariacao: 0.104,
  duracaoQueima_s: 1.7,
  t10_s: 0.07,
  t90_s: 0.35,
  tempoSubida_s: 0.28,
  impulsoEspecifico_s: 9.97,
  letraMotor: 'B',
  nomeComum: 'B1.7',
  perfilQueima: 'neutro-plato',
  anomalias: [],
};

const analiseComCritico: ResultadoAnalise = {
  ...analise,
  anomalias: [{ tipo: 'OSCILACAO', nivel: 'CRITICO', marcaTemporal: 500 }],
};

const leituras: LeituraProcessada[] = [
  { marcaTemporal: 0, forcaNewton: 2.0, temperatura: 0, emQueima: true, impulsoAcumuladoNs: 0 },
  { marcaTemporal: 100, forcaNewton: 2.5, temperatura: 0, emQueima: true, impulsoAcumuladoNs: 0.2 },
];

async function textoDoBlob(blob: Blob): Promise<string> {
  return blob.text();
}

describe('GeradorPDF', () => {
  // UT-4.4.1
  it('retorna Blob com MIME text/html', () => {
    const blob = gerarPDF(leituras, analise);
    expect(blob.type).toBe('text/html; charset=utf-8');
  });

  // UT-4.4.2
  it('Blob não vazio', () => {
    const blob = gerarPDF(leituras, analise);
    expect(blob.size).toBeGreaterThan(0);
  });

  // UT-4.4.3
  it('nome do motor B1.7 presente no conteúdo do PDF', async () => {
    const blob = gerarPDF(leituras, analise);
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('B1.7');
  });

  // UT-4.4.4
  it('sem massa → Isp mostra "Aguardando massa"', async () => {
    const semIsp: ResultadoAnalise = { ...analise, impulsoEspecifico_s: undefined };
    const blob = gerarPDF(leituras, semIsp);
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('Aguardando massa');
  });

  // UT-4.4.5
  it('com massa → Isp calculado com "s" presente', async () => {
    const blob = gerarPDF(leituras, analise, { massaPropelente_g: 30 });
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('9.97 s');
  });

  // UT-4.4.6
  it('anomalia CRITICO gera aviso no PDF', async () => {
    const blob = gerarPDF(leituras, analiseComCritico);
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('CRITICO');
  });

  // UT-4.4.7
  it('perfil de queima presente no PDF', async () => {
    const blob = gerarPDF(leituras, analise);
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('neutro-plato');
  });

  // UT-4.4.8
  it('rodapé com "GFIG / IFSC Campus Gaspar"', async () => {
    const blob = gerarPDF(leituras, analise);
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('GFIG / IFSC Campus Gaspar');
  });

  // Célula de carga (pedido do prof. Marchi)

  it('bloco "Célula de Carga" aparece com os dados da sessão', async () => {
    const blob = gerarPDF(leituras, analise, {
      descricaoCelula: 'CALT 500 kg 2023',
      massaCalibracao_g: 100,
      capacidadeMaxGramas: 500000,
      gravidade: 9.78769,
      acuracia: 0.0003,
    });
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('Célula de Carga');
    expect(texto).toContain('CALT 500 kg 2023');
    expect(texto).toContain('100.00 g');
    expect(texto).toContain('500000 g');
    expect(texto).toContain('9.78769 m/s²');
    expect(texto).toContain('0.03 % F.S.');
  });

  it('sem dados da célula (sessão antiga) o bloco some e os textos caem no padrão', async () => {
    const blob = gerarPDF(leituras, analise);
    const texto = await textoDoBlob(blob);
    expect(texto).not.toContain('Célula de Carga');
    expect(texto).toContain('±0,05% F.S.');
    expect(texto).toContain('9,80665 m/s²');
  });

  it('gravidade local 9.78769 substitui a fixa no relatório', async () => {
    const blob = gerarPDF(leituras, analise, { gravidade: 9.78769 });
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('9.78769 m/s²');
    expect(texto).not.toContain('9,80665 m/s²');
  });

  it('acurácia 0,0003 substitui a fixa nas duas seções', async () => {
    const blob = gerarPDF(leituras, analise, { acuracia: 0.0003 });
    const texto = await textoDoBlob(blob);
    expect(texto).toContain('±0.03% F.S.');
    expect(texto).not.toContain('±0,05% F.S.');
  });
});
