# Worker Windows de CAD

scripts/cad-worker-start.ps1 inicia o worker. -Once processa no máximo um pedido. Configuração por CAD_API_URL, CAD_WORKER_TOKEN, CAD_ODA, CAD_LIBS e CAD_PYTHON. Há defaults deste computador no iniciador. A chave fica em %LOCALAPPDATA%/AgoraCAD/worker-secret.xml, protegida por DPAPI da conta Windows; nunca no Drive ou Git.

O iniciador impede duas instâncias na mesma sessão com mutex. O serviço não abre porta; consulta HTTPS. ODA converte DWG/DXF e ezdxf/PyMuPDF renderiza PDF Model ajustado a A1. O arquivo original não é alterado. Input e output até 3 MiB. PDF→DWG não habilitado.

leaseToken é obrigatório e devolvido no POST. Download precisa estar no mesmo domínio HTTPS da API. Repetição de conclusão tem três tentativas; backend deduplica saída. Polling repete após falha de rede. Processo deve executar em sessão interativa para ODA; computador acordado e conta conectada.

Teste real ABR13: DWG→PDF 652775 bytes; DXF→DWG 403913 bytes; DXF→PDF 652775 bytes. Unitários Python aprovados. Serviço não ativado nem tarefa agendada registrada enquanto a publicação aprovada em produção não acontecer.

## Ativação 15/10/2026
Produção CAD publicada em dpl_3x1eVrSLuo96UYPZarZpUGD1qmVD (commit 64049a5). Fila real respondeu HTTP 200 ao worker; sem chave respondeu 401; rota usuário sem Clerk respondeu 401. Tarefa Agora CAD Worker registrada AtLogOn, Interactive, Limited, IgnoreNew, sem limite de execução. Verificado Running com um processo Python. Conta deve permanecer conectada e computador acordado.
LocalAppData é virtualizado pelo pacote Codex: o iniciador usa a chave DPAPI existente no caminho físico Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/AgoraCAD quando necessário. Sem cópia temporária e sem elevar tarefa. Limites atuais: entrada do Drive e resultado 10 MiB, upload aparelho 2 MiB; transporte em partes de 2 MiB. Teste de 10 MiB é simulado; ABR13 conversão local real e conectividade da fila real verificadas separadamente.

