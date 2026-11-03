// Estado leve compartilhado entre Phaser e React sem importar o Phaser no bundle principal.
export const shared: { ground: HTMLCanvasElement | null } = { ground: null };
