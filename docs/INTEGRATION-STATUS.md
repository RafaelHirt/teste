# Validação da integração real

A leitura da planilha foi concluída com a aba **Planilha1**: **51 registros, 27 unidades e 17 municípios**. A API local retornou HTTP 200, `source.kind: google` e dados XLSX reais. As somas dos valores financeiros brutos foram conferidas independentemente com a exportação da origem; a tabela pública renderizada também produziu as mesmas somas. O indicador mensal aplica a regra de vigência descrita abaixo, sem somar o histórico.

O leitor preserva células mescladas de unidade, município, processo e vigência. Valores monetários mesclados são contados uma única vez, inclusive na exportação CSV. Vigências informadas por mês são exibidas com essa precisão.

Pendências da própria planilha, sem alteração da origem:

- Cinco unidades ainda não possuem valores financeiros: Hospital São Silvestre; Hospital de Olhos de Valparaíso de Goiás; Hospital Municipal Evaristo Vilela de Mineiros; Hospital do Câncer de Rio Verde; Hospital Materno Infantil de Rio Verde. Elas permanecem na tabela e no mapa.
- Hospital Sagrado Coração de Jesus de Nerópolis: início **outubro/2026** e término **setembro/2026**. A inconsistência é sinalizada, sem presumir um ano corrigido.
- Uma linha de Caldas Novas não informa A Empenhar; o painel mantém o valor ausente em vez de convertê-lo para zero.

Regras confirmadas pelo usuário: ler diretamente **A Empenhar**, sem recalcular; hífen isolado ou formato contábil `R$ -` significa saldo zero e **100% empenhado**. Glosa é apresentada separadamente. **Valor mensal considera somente a vigência do mês atual**, com avisos para linhas sem vigência, datas invertidas ou sobreposições. Se há mais de um valor independente vigente no mês, o painel não escolhe nem soma valores arbitrariamente: exibe **Não informado** para a unidade e identifica o subtotal global como parcial. A mesma célula mensal mesclada é contada uma vez. As demais métricas continuam seguindo os registros filtrados; o mensal verifica todas as linhas das unidades selecionadas para que filtros não ocultem conflitos.

Na leitura validada em **08/10/2026**, o mensal de outubro teve **12 unidades confirmadas**, subtotal de **R$ 13.383.976,28**, e **15 unidades a conferir**: nove com vigências sobrepostas, cinco sem datas e valores financeiros, e a vigência invertida de Nerópolis. Esse subtotal não representa o mensal completo das 27 unidades; a confirmação depende da correção das pendências na planilha.

Ainda resta conectar o repositório ao projeto Netlify e validar API, Netlify Blobs e execução agendada no deploy de produção. O empacotamento das funções e o registro do agendamento `0 9 * * *` foram verificados localmente; isso não comprova publicação ou execução na plataforma.
