# Worker Windows de CAD

scripts/cad-worker-start.ps1 inicia o worker. -Once processa no máximo um pedido. Configuração por CAD_API_URL, CAD_WORKER_TOKEN, CAD_ODA, CAD_LIBS e CAD_PYTHON. Há defaults deste computador no iniciador. A chave fica em %LOCALAPPDATA%/AgoraCAD/worker-secret.xml, protegida por DPAPI da conta Windows; nunca no Drive ou Git.

O iniciador impede duas instâncias na mesma sessão com mutex. O serviço não abre porta; consulta HTTPS. ODA converte DWG/DXF e ezdxf/PyMuPDF renderiza PDF Model ajustado a A1. O arquivo original não é alterado. Input e output até 3 MiB. PDF→DWG não habilitado.

leaseToken é obrigatório e devolvido no POST. Download precisa estar no mesmo domínio HTTPS da API. Repetição de conclusão tem três tentativas; backend deduplica saída. Polling repete após falha de rede. Processo deve executar em sessão interativa para ODA; computador acordado e conta conectada.

Teste real ABR13: DWG→PDF 652775 bytes; DXF→DWG 403913 bytes; DXF→PDF 652775 bytes. Unitários Python aprovados. Serviço não ativado nem tarefa agendada registrada enquanto a publicação aprovada em produção não acontecer.
