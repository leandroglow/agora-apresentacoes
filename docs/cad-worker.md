# Worker local de CAD

Processo Windows de saída: consulta GET /api/cad-worker, baixa o arquivo por HTTPS autenticado, converte e envia POST /api/cad-worker. Não abre porta local e não altera originais.

Variáveis: CAD_API_URL, CAD_WORKER_TOKEN, CAD_ODA, CAD_LIBS opcional, CAD_PYTHON opcional, CAD_WORKER_POLL_SECONDS e CAD_WORKER_TIMEOUT_SECONDS. Execute scripts/cad-worker-start.ps1; use -Once para uma consulta. A instalação agendada fica fora deste escopo até confirmação operacional.

O GET retorna {job:null} ou {job:{id,inputName,format,downloadUrl,leaseToken}}. O POST devolve leaseToken em completed/failed, com dataBase64/name no sucesso. ODA atende alvos DWG e DXF; DWG para PDF passa por DXF e ezdxf/PyMuPDF. PDF é validado pelo PyMuPDF. Entrada e saída são limitadas a 3 MB para caber no payload da Vercel. Cada trabalho usa pasta temporária UUID.

O endpoint /api/cad-worker já existe no repositório e usa x-cad-worker-token; a operação real ainda depende de deployment, token configurado, Drive acessível e fila populada. A conversão local real do ABR13.dxf foi executada com ezdxf/PyMuPDF: 1 página PDF, 652.775 bytes. Os testes reais DWG→PDF (652.775 bytes) e DXF→DWG (403.913 bytes) passaram em diretórios temporários.

Para instalação segura no Windows, use uma conta dedicada sem privilégios administrativos, mantenha CAD_WORKER_TOKEN somente nas variáveis de ambiente da conta da tarefa, restrinja ACL do diretório e execute apenas scripts/cad-worker-start.ps1. Uma tarefa agendada pode usar powershell.exe -NoProfile -ExecutionPolicy Bypass -File <caminho>, com execução somente quando a conta estiver conectada e sem exposição de porta. Não registrar o token em argumentos, logs ou arquivos do repositório.
 
