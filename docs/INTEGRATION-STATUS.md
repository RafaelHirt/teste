# Validação da integração real

O aplicativo está implementado para Netlify. Estes pontos ainda precisam de validação com a origem real:

- Acesso ao arquivo do Google: a conexão foi bloqueada pela política de rede do ambiente, antes de receber qualquer resposta do Google. Isso não permite concluir se o arquivo é público ou privado.
- Nome da aba e cabeçalhos: configure `SHEET_TAB` e `SHEET_COLUMNS_JSON` caso os nomes reais sejam diferentes dos reconhecidos. O servidor fornece mensagens de diagnóstico; não combina automaticamente abas de períodos diferentes.
- Municípios: o mapa associa nomes, não deduz municípios a partir do nome da unidade. Se a planilha não possuir a coluna de município, esse dado precisa ser fornecido na origem.
- Publicação no Netlify: conectar o repositório e validar a API, Netlify Blobs e o agendamento no deploy de produção.

Regras confirmadas pelo usuário: usar a coluna **A Empenhar**, sem recalcular; hífen isolado significa saldo zero e **100% empenhado**. A glosa aparece separadamente.

Foram exercitados arquivos XLSX controlados, fórmulas com resultado salvo, datas brasileiras, ausência de valores, cache por dia em Brasília, assinatura da conta de serviço, falhas de atualização, filtros, seleção por mapa, exportação CSV e interface móvel. Esses testes não substituem a conferência com a planilha real.
