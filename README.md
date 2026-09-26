# Caraúno | Gestão Florestal

Aplicação web em Google Apps Script conectada à planilha Google informada no projeto. A interface foi desenhada com base na paleta do logo: verde-floresta, marrom-terra e fundos claros.

## Base de dados

Ao executar `setupDatabase()`, o sistema cria ou prepara estas abas:

| Aba | Uso | Colunas principais |
| --- | --- | --- |
| `Lancamentos` | Tabela financeira principal, uma movimentação por linha | ID, documento, tipo, categoria, descrição, parte, competência, vencimento, valor, situação, pagamento, observações |
| `PlanoContas` | Cadastro de tipos e categorias válidas | tipo, categoria, ativo |
| `ResumoMensal` | Totais mensais derivados dos lançamentos | mês, receitas, despesas, investimentos, resultado operacional, saldo do mês |

Se a planilha já contiver as abas `Lançamentos Diários` e `Plano de Contas Ref`, a configuração migra os registros preenchidos e as categorias, mantendo as abas originais. As linhas vazias do Excel são ignoradas. O resumo mensal é reconstruído a partir dos lançamentos; a aba original `Balanço Mensal` não é alterada.

Na migração, a competência do lançamento usa a data de pagamento quando preenchida; caso contrário, usa o vencimento. Confira essa regra contábil antes de operar se a fazenda adotar outra definição de competência.

## Correção: No HTML file named Index was found

Esse erro ocorre quando a versão executada no Google Apps Script não contém o HTML chamado `Index`. O arquivo local não é enviado ao Google automaticamente.

Para corrigir usando um único arquivo:

1. Abra `publicacao/CodigoCompleto.gs` em um editor de texto e copie todo o conteúdo.
2. No projeto existente do Google Apps Script, substitua todo o conteúdo de `Código.gs` (ou `Code.gs`) pelo conteúdo copiado e salve. **Não adicione como um segundo arquivo de script**, pois isso duplicaria as funções e constantes.
3. Esse arquivo já contém o código do servidor e a interface completa. Não é necessário criar `Index.html` no Google; um HTML que já exista pode permanecer, mas esta versão usa a interface incorporada.
4. Abra **Implantar > Gerenciar implantações**, selecione a implantação existente e clique no lápis. Em **Versão**, escolha **Nova versão** e clique em **Implantar**, mantendo as configurações de acesso existentes.
5. Reabra a mesma URL do aplicativo e confirme o carregamento da tela e dos dados.

O pacote local não atualiza a implantação do Google automaticamente. A URL informada para esta implantação é:

https://script.google.com/macros/s/AKfycbyyHWN_kJq1SBdgdCVUeM2GcjW8q6tHAJjm9aLAmp7UVyFObSz5Hb1k9PgSq3-w0kZdwA/exec

Para manutenção, edite `Code.gs` e `Index.html` e gere novamente o arquivo completo com `python scripts/gerar_publicacao.py`. O pacote apenas incorpora a interface; as funções e regras financeiras são preservadas.

Referências: [HTML Service](https://developers.google.com/apps-script/reference/html/html-service) e [atualizar uma implantação](https://developers.google.com/apps-script/concepts/deployments).

## Instalação com arquivos separados

1. Abra a planilha Google com a conta que tem permissão de edição. Confirme que nela estão as abas antigas do Excel. Se a planilha estiver vazia, importe o arquivo `.xlsx` para essa planilha antes de continuar; o Apps Script não lê arquivos que existam apenas no disco local.
2. Na planilha, abra **Extensões > Apps Script**. Substitua o conteúdo do arquivo de script por `Code.gs` e crie um arquivo HTML chamado `Index`, colando o conteúdo de `Index.html`.
3. No editor do Apps Script, selecione `setupDatabase` e clique em **Executar**. Revise e autorize o acesso à planilha. Confirme que as três abas novas foram criadas e que `Lancamentos` contém os registros migrados.
4. Clique em **Implantar > Nova implantação > Aplicativo da web**. Execute como a conta proprietária e limite o acesso às pessoas ou ao domínio autorizado. Não publique uma planilha financeira para acesso público.
5. Abra a URL da implantação. Para publicar atualizações posteriores, crie uma nova versão da implantação.

## Correção de carregamento contínuo

O pacote `publicacao/CodigoCompleto.gs` foi atualizado para incluir a primeira consulta no HTML servido por `doGet`. Assim, o dashboard inicial não depende da resposta assíncrona de `google.script.run`. As consultas seguintes exibem um erro persistente e uma opção de tentar novamente quando o Google não responde em 20 segundos. O indicador lateral só informa conexão após receber dados válidos.

A primeira publicação dessa correção entregou a interface nova sem o bloco de dados iniciais. O pacote foi ajustado novamente para inserir `window.CARAUNO_INITIAL_DATA` em um script executável antes da interface, com escape dos dados. Essa revisão não depende de comentários HTML ou de blocos `application/json` preservados pelo Google.

Após a republicação pelo usuário, a consulta ao endereço `/exec` confirmou HTTP 200, o bloco inicial antes do código da interface, 30 lançamentos, 21 categorias e ausência de erro do servidor. Para setembro de 2026, retornou R$ 29.041,99 em despesas e R$ 153.643,00 em investimentos. A sintaxe dos dois scripts entregues também foi validada. Essa verificação confirma a leitura e a entrega dos dados iniciais; não executou cadastros ou exclusões pelo navegador.

As consultas abrem a base sem recriar abas, migrar dados ou regravar o resumo. A preparação continua em `setupDatabase`; gravações e exclusões continuam atualizando o resumo mensal. A atualização exige substituir o script e publicar uma nova versão da implantação existente. A conexão com o Google Sheets não permite publicar o Apps Script.

Validação local: `scripts/test_loading.mjs` verifica os 30 registros importados, o HTML com dados iniciais, falhas de permissão, ausência de abas, ponte indisponível, consultas sem retorno, respostas inválidas e respostas antigas. Esses testes usam serviços simulados; não constituem uma confirmação da execução da nova versão no Google.

## Telas

- Dashboard: receitas, despesas, resultado operacional, investimentos, movimento mensal e principais custos.
- Despesas e custos: despesas e investimentos, com filtro de tipo.
- Receitas: entradas por categoria.
- Novo lançamento: cadastro de competência, vencimento, pagamento, documento, parte e valor.
- Lista de lançamentos: busca, período, situação e categoria; edição e exclusão.

O menu e a interface são um **Aplicativo da web do Apps Script**, não um aplicativo nativo criado no produto AppSheet. Para usar também o AppSheet, crie um app a partir desta planilha e use `Lancamentos` e `PlanoContas` como tabelas; configure `Lancamentos.ID` como chave e `PlanoContas.Categoria` como chave da tabela de categorias.

## Fonte analisada

O Excel local contém as abas `Balanço Mensal`, `Lançamentos Diários` e `Plano de Contas Ref`. Há 30 lançamentos preenchidos (18 pagos e 12 a pagar), além das linhas vazias no intervalo formatado. A validação e a migração para a planilha Google estão registradas a seguir.

## Importação realizada em 26/09/2026

Após a liberação de acesso, foram criadas e preenchidas na planilha `database_carauno` as abas `Lancamentos` (A1:M31), `PlanoContas` (A1:C22), `ResumoMensal` (A1:F14) e `DeParaImportacao` (A1:E27). A aba `Página1` foi preservada.

Foram importados os 30 registros de `Lançamentos Diários!A3:I32` e as 21 categorias do Excel. A soma dos valores é R$ 1.484.471,98: R$ 36.541,99 em despesas e R$ 1.447.929,99 em investimentos. Não há receitas no arquivo. O de-para e a regra de competência estão documentados na própria planilha. A releitura pelo conector confirmou todos os valores e identificadores gravados.

O documento `Nfe 02.2`, linha 22 do Excel, tem vencimento em **01/10/2015**. A data foi preservada em `Lancamentos!G21:H21`, com nota para revisão, e participa do resumo em `2015-10`. Não presumir uma nova data sem confirmação do usuário.

`scripts/preparar_importacao.py` gera os lotes locais de estrutura e dados, mas não faz chamadas ao Google. Não reaplique esses lotes sobre a planilha preenchida: a importação já foi concluída. Para cargas futuras, confira IDs e diferenças antes de escrever.
