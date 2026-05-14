export class TelaCreditos {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.html();
    document.body.appendChild(this.overlay);

    this.overlay.querySelector('#btn-fechar-creditos')!.addEventListener('click', () => this.destruir());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.destruir();
    });
  }

  private html(): string {
    const logos = [
      { src: `${import.meta.env.BASE_URL}imgs/logo_campusGaspar.png`, alt: 'IFSC Campus Gaspar' },
      { src: `${import.meta.env.BASE_URL}imgs/logo_compSteam.png`,    alt: 'CompSteam' },
      { src: `${import.meta.env.BASE_URL}imgs/logo_gfig.png`,         alt: 'GFIG' },
      { src: `${import.meta.env.BASE_URL}imgs/logo_gfig_pb.png`,      alt: 'GFIG' },
      { src: `${import.meta.env.BASE_URL}imgs/logo_receita.png`,      alt: 'Receita' },
      { src: `${import.meta.env.BASE_URL}imgs/logo-bar.png`,          alt: 'BAR' },
    ];

    return `
      <div class="modal" style="max-width:700px;text-align:center">
        <div class="modal-header">
          <h2 style="margin:0;flex:1">Créditos</h2>
          <button class="modal-fechar" id="btn-fechar-creditos">×</button>
        </div>
        <div class="modal-body">

          <p style="font-size:1.6rem;font-weight:700;color:#111;margin-bottom:4px">balançaGFIG</p>
          <p style="font-size:1rem;color:#555;margin-bottom:2px">Sistema de Teste de Motores Foguete</p>
          <p style="font-size:0.85rem;color:#6b7280;margin-bottom:1.5rem">
            Instituto Federal de Santa Catarina (IFSC) — Campus Gaspar
          </p>

          <div style="background:#f8f9fa;border-radius:8px;padding:1rem 1.5rem;text-align:left;margin-bottom:1.5rem;font-size:0.9rem;line-height:1.8;color:#374151">
            <p style="margin-bottom:0.5rem"><strong>Desenvolvido nos seguintes projetos:</strong></p>
            <p>• <strong>Grupo de Foguetes do Campus Gaspar (GFIG)</strong></p>
            <p>• <strong>Projeto de Ensino:</strong> Controle e Automação de Eletrodomésticos do Cotidiano</p>
            <p>• <strong>Grupo de Pesquisa CompSteam</strong></p>
            <p>• <strong>Projeto BoxSteam</strong> — Campus Gaspar</p>
          </div>

          <p style="font-size:0.85rem;color:#6b7280;line-height:1.6;margin-bottom:1.5rem">
            Sistema desenvolvido para testes estáticos de motores foguete de propelente sólido,<br>
            com análise em tempo real de curvas de empuxo e geração de relatórios técnicos.
          </p>

          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.5rem;padding:1rem;background:#f8f9fa;border-radius:8px;margin-bottom:1rem">
            ${logos.map(l => `
              <img src="${l.src}" alt="${l.alt}"
                   style="max-height:80px;max-width:140px;object-fit:contain"
                   onerror="this.style.display='none'">
            `).join('')}
          </div>

        </div>
        <div class="modal-footer" style="justify-content:center;flex-direction:column;gap:4px">
          <span style="font-size:0.8rem;color:#9ca3af">© 2025 — Instituto Federal de Santa Catarina</span>
          <span style="font-size:0.75rem;color:#d1d5db">Todos os direitos reservados</span>
        </div>
      </div>
    `;
  }

  destruir() {
    this.overlay.remove();
  }
}
