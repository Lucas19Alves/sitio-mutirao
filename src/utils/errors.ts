import { ITEM_BY_ID, TOOL_BY_ID, BUILDING_BY_ID } from '../data/catalog.ts';
import type { ToolId } from '../data/catalog.ts';

const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Traduz os códigos de erro do servidor para mensagens que dizem o que fazer. */
export function errorText(code: string | undefined): string {
  if (!code) return 'Algo deu errado.';
  const [k, a, b] = code.split(':');
  switch (k) {
    case 'missing_item': return `Faltam itens: ${b}× ${itemName(a)}.`;
    case 'no_coins': return `Moedas insuficientes (precisa de ${a}).`;
    case 'storage_full': return 'Celeiro cheio. Venda itens ou melhore o Celeiro.';
    case 'level_required': return `Disponível no nível ${a} da fazenda.`;
    case 'tool_required': return `Precisa de ${TOOL_BY_ID[a as ToolId]?.tiers[Number(b) - 1]?.name ?? a}.`;
    case 'node_depleted': return 'Esse recurso já foi coletado. Ele volta em instantes.';
    case 'region_locked': return 'Região ainda bloqueada. Desbloqueie no Quadro de Projetos.';
    case 'plot_busy': return 'Esse canteiro já está plantado.';
    case 'plot_empty': return 'Nada plantado aqui.';
    case 'not_ready': return 'Ainda não está pronto.';
    case 'queue_full': return 'Fila de produção cheia. Colete ou melhore o prédio.';
    case 'not_built': return 'Esse prédio ainda não foi construído.';
    case 'already_built': return 'Esse prédio já existe.';
    case 'building_required': return `Exige ${BUILDING_BY_ID[a]?.name ?? a}.`;
    case 'max_level': return 'Nível máximo atingido.';
    case 'max_tier': return 'Ferramenta já está no melhor tier.';
    case 'not_needed': return 'Esse item já foi todo entregue.';
    case 'too_many_projects': return 'Máximo de 4 projetos ativos. Conclua um antes.';
    case 'quest_incomplete': return 'A missão ainda não foi cumprida.';
    case 'already_unlocked': return 'Região já desbloqueada.';
    case 'invalid_code': return 'Código de convite não encontrado.';
    case 'farm_full': return 'Essa fazenda já tem 4 membros.';
    case 'too_many_farms': return 'Você já participa de 5 fazendas.';
    case 'invalid_name': return 'O nome da fazenda precisa ter de 2 a 32 caracteres.';
    case 'not_member': return 'Você não faz parte dessa fazenda.';
    case 'network': return 'Sem conexão. Tentando de novo…';
    default: return 'Ação recusada pelo servidor.';
  }
}
