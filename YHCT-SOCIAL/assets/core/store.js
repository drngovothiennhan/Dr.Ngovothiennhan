const clone = value => structuredClone(value);
export class MemoryAdapter {
  #state; #checkpoints = new Map();
  constructor(seed={}) { this.#state=clone(seed); }
  async get(){ return clone(this.#state); }
  async patch(patch){ this.#state={...this.#state,...clone(patch)}; return this.get(); }
  async checkpoint(label='checkpoint'){
    const id=`cp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const cp={id,label,at:Date.now(),state:clone(this.#state)};
    this.#checkpoints.set(id,cp); return clone(cp);
  }
  async restore(id){ const cp=this.#checkpoints.get(id); if(!cp) throw new Error('checkpoint_not_found'); this.#state=clone(cp.state); return this.get(); }
  async listCheckpoints(){ return [...this.#checkpoints.values()].map(clone); }
}
export class LocalStorageAdapter {
  constructor(key='yhct-social-v2', seed={}) { this.key=key; this.seed=seed; }
  async get(){ try { return JSON.parse(localStorage.getItem(this.key)) ?? structuredClone(this.seed); } catch { return structuredClone(this.seed); } }
  async patch(patch){ const next={...(await this.get()),...structuredClone(patch)}; localStorage.setItem(this.key,JSON.stringify(next)); return next; }
  async checkpoint(label='checkpoint') { const id=`cp_${Date.now()}`; const cp={id,label,at:Date.now(),state:await this.get()}; localStorage.setItem(`${this.key}:${id}`,JSON.stringify(cp)); return cp; }
  async restore(id){ const raw=localStorage.getItem(`${this.key}:${id}`); if(!raw) throw new Error('checkpoint_not_found'); const cp=JSON.parse(raw); localStorage.setItem(this.key,JSON.stringify(cp.state)); return cp.state; }
}
export function createRepository(adapter) {
  return {
    get:()=>adapter.get(), patch:p=>adapter.patch(p), checkpoint:l=>adapter.checkpoint(l), restore:id=>adapter.restore(id),
    listCheckpoints:()=>adapter.listCheckpoints ? adapter.listCheckpoints() : Promise.resolve([])
  };
}
