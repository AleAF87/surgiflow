export function gerarId(prefix) {
  const base = Date.now().toString(36);
  const aleatorio = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${base}${aleatorio}`;
}

export function gerarIdPaciente() {
  return gerarId("p");
}

export function gerarIdMedico() {
  return gerarId("m");
}

export function gerarIdCirurgia() {
  return gerarId("c");
}
