export class TelaEsquema {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = `
      <div class="modal" style="max-width:900px">
        <div class="modal-header">
          <h2 style="margin:0;flex:1">Esquema Elétrico — Banca de Teste Estático</h2>
          <button class="modal-fechar" id="btn-fechar-esquema">×</button>
        </div>
        <div class="modal-body" style="text-align:center">
          <img src="/imgs/esquema-eletrico.png"
               alt="Esquema elétrico de montagem da banca de teste estático"
               style="width:100%;max-width:860px;border-radius:8px;border:1px solid #e5e7eb"
               onerror="this.replaceWith(Object.assign(document.createElement('p'),{textContent:'Imagem não encontrada.',style:'color:#6b7280'}))">
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.overlay.querySelector('#btn-fechar-esquema')!.addEventListener('click', () => this.destruir());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.destruir();
    });
  }

  destruir() {
    this.overlay.remove();
  }
}
