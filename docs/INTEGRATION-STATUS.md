# Validação da integração real

A leitura da planilha foi concluída com a aba **Planilha1**: **51 registros, 27 unidades e 17 municípios**. A API local retornou HTTP 200, `source.kind: google` e dados XLSX reais. Os quatro totais financeiros foram conferidos independentemente com a exportação da origem; a tabela pública renderizada também produziu os mesmos totais.

O leitor preserva células mescladas de unidade, município, processo e vigência. Valores monetários mesclados são contados uma única vez, inclusive na exportação CSV. Vigências informadas por mês são exibidas com essa precisão.

Pendências da própria planilha, sem alteração da origem:

- Cinco unidades ainda não possuem valores financeiros: Hospital São Silvestre; Hospital de Olhos de Valparaíso de Goiás; Hospital Municipal Evaristo Vilela de Mineiros; Hospital do Câncer de Rio Verde; Hospital Materno Infantil de Rio Verde. Elas permanecem na tabela e no mapa.
- Hospital Sagrado Coração de Jesus de Nerópolis: início **outubro/2026** e término **setembro/2026**. A inconsistência é sinalizada, sem presumir um ano corrigido.
- Uma linha de Caldas Novas não informa A Empenhar; o painel mantém o valor ausente em vez de convertê-lo para zero.

Regra confirmada pelo usuário: ler diretamente **A Empenhar**, sem recalcular; hífen isolado ou formato contábil `R$ -` significa saldo zero e **100% empenhado**. Glosa é apresentada separadamente. O valor mensal global soma as linhas selecionadas; os filtros de parcelas e vigência permitem delimitar quais registros entram na soma.

Ainda resta conectar o repositório ao projeto Netlify e validar API, Netlify Blobs e execução agendada no deploy de produção. O empacotamento das funções e o registro do agendamento `0 9 * * *` foram verificados localmente; isso não comprova publicação ou execução na plataforma.
