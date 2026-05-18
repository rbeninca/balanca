import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { exportarCSV } from '@balancagfig/relatorio';

export interface SessaoLocal {
  id: string;
  nome: string;
  criadoEm: string;
}

export interface MetadadosLocal {
  massaPropelente_g?: number;
  massaTotal_g?: number;
  diametro_mm?: number;
  comprimento_mm?: number;
  fabricante?: string;
  descricao?: string;
  observacoes?: string;
}

export interface IArmazenamento {
  criarSessao(nome: string): Promise<SessaoLocal>;
  listarSessoes(): Promise<SessaoLocal[]>;
  atualizarSessao(id: string, dados: Partial<Pick<SessaoLocal, 'nome' | 'criadoEm'>>): Promise<SessaoLocal>;
  excluirSessao(id: string): Promise<void>;
  adicionarLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void>;
  obterLeituras(idSessao: string): Promise<LeituraProcessada[]>;
  exportarCSV(idSessao: string): Promise<string>;
  substituirLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void>;
  salvarMetadados(idSessao: string, meta: MetadadosLocal): Promise<void>;
  obterMetadados(idSessao: string): Promise<MetadadosLocal | null>;
}

const DB_NOME = 'balancaGFIG';
const DB_VER  = 1;

function abrirBD(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VER);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('sessoes')) {
        db.createObjectStore('sessoes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('leituras')) {
        const ls = db.createObjectStore('leituras', { autoIncrement: true });
        ls.createIndex('id_sessao', 'id_sessao', { unique: false });
      }
      if (!db.objectStoreNames.contains('metadados')) {
        db.createObjectStore('metadados', { keyPath: 'id_sessao' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], modo: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const t = db.transaction(stores, modo);
  return fn(t);
}

function put<T>(store: IDBObjectStore, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function add<T>(store: IDBObjectStore, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.add(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function getByIndex<T>(index: IDBIndex, key: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = index.getAll(key);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function getOne<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function deleteKey(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteByIndex(store: IDBObjectStore, index: IDBIndex, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = index.openCursor(key);
    const toDelete: IDBValidKey[] = [];
    req.onsuccess = (ev) => {
      const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        toDelete.push(cursor.primaryKey);
        cursor.continue();
      } else {
        Promise.all(toDelete.map(k => deleteKey(store, k))).then(() => resolve()).catch(reject);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function gerarUUID(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // crypto.randomUUID exige HTTPS; fallback via getRandomValues (funciona em HTTP)
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (+c / 4)))).toString(16),
  );
}

export class ArmazenamentoLocal implements IArmazenamento {
  async criarSessao(nome: string): Promise<SessaoLocal> {
    const id = gerarUUID();
    const sessao: SessaoLocal = { id, nome, criadoEm: new Date().toISOString() };
    const db = await abrirBD();
    await tx(db, ['sessoes'], 'readwrite', async (t) => put(t.objectStore('sessoes'), sessao));
    db.close();
    return sessao;
  }

  async listarSessoes(): Promise<SessaoLocal[]> {
    const db = await abrirBD();
    const lista = await tx(db, ['sessoes'], 'readonly', async (t) => getAll<SessaoLocal>(t.objectStore('sessoes')));
    db.close();
    return lista;
  }

  async atualizarSessao(id: string, dados: Partial<Pick<SessaoLocal, 'nome' | 'criadoEm'>>): Promise<SessaoLocal> {
    const db = await abrirBD();
    return new Promise<SessaoLocal>((resolve, reject) => {
      const t     = db.transaction(['sessoes'], 'readwrite');
      t.onerror   = () => { db.close(); reject(t.error); };
      t.onabort   = () => { db.close(); reject(new Error('Transação abortada')); };
      const store = t.objectStore('sessoes');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const atual = getReq.result as SessaoLocal | undefined;
        if (!atual) { db.close(); reject(new Error('Sessão não encontrada')); return; }
        const atualizada: SessaoLocal = { ...atual, ...dados };
        const putReq = store.put(atualizada);
        putReq.onsuccess = () => { db.close(); resolve(atualizada); };
        putReq.onerror   = () => { db.close(); reject(putReq.error); };
      };
      getReq.onerror = () => { db.close(); reject(getReq.error); };
    });
  }

  async excluirSessao(id: string): Promise<void> {
    const db = await abrirBD();
    await tx(db, ['sessoes', 'leituras', 'metadados'], 'readwrite', async (t) => {
      const lsStore = t.objectStore('leituras');
      const idx = lsStore.index('id_sessao');
      await deleteByIndex(lsStore, idx, id);
      await deleteKey(t.objectStore('metadados'), id);
      await deleteKey(t.objectStore('sessoes'), id);
    });
    db.close();
  }

  async adicionarLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void> {
    const db = await abrirBD();
    await tx(db, ['leituras'], 'readwrite', async (t) => {
      const store = t.objectStore('leituras');
      for (const l of leituras) {
        await add(store, {
          id_sessao:          idSessao,
          marcaTemporal:      l.marcaTemporal,
          forcaNewton:        l.forcaNewtonCrua ?? l.forcaNewton,
          temperatura:        l.temperatura,
          emQueima:           l.emQueima,
          impulsoAcumuladoNs: l.impulsoAcumuladoNs,
        });
      }
    });
    db.close();
  }

  async obterLeituras(idSessao: string): Promise<LeituraProcessada[]> {
    const db = await abrirBD();
    const linhas = await tx(db, ['leituras'], 'readonly', async (t) => {
      const store = t.objectStore('leituras');
      const idx = store.index('id_sessao');
      return getByIndex<any>(idx, idSessao);
    });
    db.close();
    return linhas.map(({ id_sessao: _id, ...l }) => l as LeituraProcessada);
  }

  async exportarCSV(idSessao: string): Promise<string> {
    const leituras = await this.obterLeituras(idSessao);
    return exportarCSV(leituras);
  }

  async substituirLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void> {
    const db = await abrirBD();

    // Fase 1: apaga com cursor direto numa transação callback-only
    // (evita auto-commit da transação IDB ao misturar Promise.all com await)
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['leituras'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror    = () => reject(t.error);
      t.onabort    = () => reject(t.error);
      const req = t.objectStore('leituras').index('id_sessao').openCursor(idSessao);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      req.onerror = () => reject(req.error);
    });

    // Fase 2: insere novas leituras numa transação separada
    if (leituras.length > 0) {
      await tx(db, ['leituras'], 'readwrite', async (t) => {
        const store = t.objectStore('leituras');
        for (const l of leituras) {
          await add(store, {
            id_sessao:          idSessao,
            marcaTemporal:      l.marcaTemporal,
            forcaNewton:        l.forcaNewtonCrua ?? l.forcaNewton,
            temperatura:        l.temperatura,
            emQueima:           l.emQueima,
            impulsoAcumuladoNs: l.impulsoAcumuladoNs,
          });
        }
      });
    }

    db.close();
  }

  async salvarMetadados(idSessao: string, meta: MetadadosLocal): Promise<void> {
    const db = await abrirBD();
    await tx(db, ['metadados'], 'readwrite', async (t) => put(t.objectStore('metadados'), { id_sessao: idSessao, ...meta }));
    db.close();
  }

  async obterMetadados(idSessao: string): Promise<MetadadosLocal | null> {
    const db = await abrirBD();
    const meta = await tx(db, ['metadados'], 'readonly', async (t) => getOne<any>(t.objectStore('metadados'), idSessao));
    db.close();
    if (!meta) return null;
    const { id_sessao: _, ...dados } = meta;
    return dados as MetadadosLocal;
  }
}
