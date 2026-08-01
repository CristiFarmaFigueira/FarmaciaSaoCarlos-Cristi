/**
 * CONFIGURAÇÃO LOCAL — NÃO publique este arquivo (GitHub / Netlify / site público).
 *
 * BINS NO JSONBIN:
 *   1. bin-configuracoes.json  → SETTINGS_BIN_ID
 *   2. bin-produtos-parte1.json → PRODUCT_BIN_IDS[0]
 *   3. bin-produtos-parte2.json → PRODUCT_BIN_IDS[1]
 *   4. bin-produtos-parte3.json → PRODUCT_BIN_IDS[2]
 *   5. bin-produtos-novos.json  → PRODUCT_BIN_IDS[3]  (vazio, produtos novos do admin)
 *
 * Pesquisas e interações (leads/pedidos) NÃO são salvas (privacidade).
 */
window.FARMA_CONFIG = {

  // Configurações da loja (nome, horário, WhatsApp, FAQ...)
  SETTINGS_BIN_ID: "6a6e4f87f5f4af5e29df106e",

  // 4 bins de produtos: 3 do catálogo + 1 para produtos novos do admin
  PRODUCT_BIN_IDS: [
    "6a6e5025f5f4af5e29df1207",
    "6a6e5044f5f4af5e29df125a",
    "6a6e505fda38895dfeada0c7",
    "6a6e5076f5f4af5e29df12e6"
  ]
};
