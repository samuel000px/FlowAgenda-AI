# Hospedagem: aprovar pelo celular, com senha

> **Antes de tudo:** hoje a interface ainda roda os **cenários fictícios**. Hospedar já serve para a
> dona do salão testar pelo celular e aprender o fluxo. Para operar a agenda de verdade, ainda falta o
> "modo real": o relógio de verdade no lugar do `agora` fixo e a agenda vindo do Google Agenda.

## 1. A senha (vale para qualquer opção)

A interface pede senha quando a variável `APP_SENHA` está configurada. Sem ela, o app abre direto, o
que só serve para usar no próprio computador.

- Escolha uma senha comprida, de pelo menos 12 caracteres. Pode ser uma frase, como `esmalte-rosa-na-terca`.
- No computador, ela fica no `.env`: `APP_SENHA=...`. Numa hospedagem, fica nos "segredos" do site.
- Não mande a senha junto com o link no mesmo lugar.
- O botão **Sair** fica no painel lateral.

## 2. Escolha onde rodar

| | A. Streamlit Community Cloud | B. Computador do salão + Tailscale | C. Servidor pago |
|---|---|---|---|
| Custo | grátis | grátis | ~R$ 10 a 40/mês |
| Fica ligado | sim (dorme depois de um tempo sem uso; acorda ao abrir) | só com o computador ligado | sim |
| Histórico (`registro/historico.csv`) | **some quando o app reinicia** | fica guardado | fica guardado (com disco) |
| Quem acessa | qualquer um com link **e** senha | só aparelhos da rede Tailscale **e** senha | qualquer um com link **e** senha |

Resumo: a **B** funciona hoje sem perder nada. A **A** é a mais prática, mas só fica completa
quando o histórico for para o Google Planilhas.

---

## Opção A: Streamlit Community Cloud

1. Entre em [share.streamlit.io](https://share.streamlit.io) com a conta do GitHub que tem acesso ao
   repositório. Se a sua conta não puder publicar a partir do repositório do Samuel, faça um fork e publique a partir dele.
2. **Create app**, depois **Deploy a public app from GitHub**:
   - Repository: `samuel000px/FlowAgenda-AI` (ou o seu fork)
   - Branch: `main`
   - Main file path: `agente-remarcacao/app.py`
3. Em **Advanced settings**, escolha Python 3.12 e cole os segredos (formato TOML):
   ```toml
   GEMINI_API_KEY = "sua-chave"
   GEMINI_MODEL = "gemini-3.5-flash-lite"
   APP_SENHA = "sua-senha-comprida"
   AVISO_MINIMO_H = "1"
   ```
   Os segredos do nível principal viram variáveis de ambiente, que é de onde o código lê. Nada disso vai para o GitHub.
4. **Deploy.** Em alguns minutos, sai um endereço `https://...streamlit.app`. Mande o link para o
   celular da dona do salão e, por outro caminho, a senha.

**Cuidados:**
- **Não ligue "Usar e registrar histórico" nessa opção** até o histórico ir para o Google Planilhas:
  o arquivo é apagado quando o app reinicia.
- Quem tiver o link vê a tela de senha. A senha é o que protege; por isso, ela precisa ser comprida.

## Opção B: computador do salão + Tailscale

O Tailscale cria uma rede privada entre o computador e o celular. O app não fica aberto para a
internet: só aparelhos que entraram na mesma conta do Tailscale conseguem abrir.

1. No computador, instale o Tailscale ([tailscale.com/download](https://tailscale.com/download)) e
   entre com uma conta, por exemplo a Google da dona do salão.
2. No celular dela, instale o app **Tailscale** e entre **com a mesma conta**. Deixe ligado.
3. No computador, coloque `APP_SENHA=...` no `.env` e rode, dentro de `agente-remarcacao`:
   ```bash
   streamlit run app.py
   ```
   Se o Windows perguntar sobre o firewall, permita só em **redes privadas**.
4. No app do Tailscale, veja o nome do computador (ex.: `pc-salao`). No celular, abra
   `http://pc-salao:8501`, ou o endereço `100.x.y.z:8501` que o Tailscale mostra.
5. Para não cair, desligue a suspensão do computador (Configurações > Energia).

O histórico fica em `registro/historico.csv`, no próprio computador. Vale fazer uma cópia de vez em quando.

## Opção C: servidor pago

Render, Railway ou uma VPS pequena. O processo é parecido com a opção A (variáveis de ambiente
para a chave e a senha), mas é preciso pedir um **disco persistente** e apontar `HISTORICO_ARQUIVO` para ele.
Só vale a pena se a A e a B não servirem.

## Checklist antes de passar o link

- [ ] `APP_SENHA` configurada e testada (senha errada é recusada).
- [ ] A chave do Gemini está nos segredos ou no `.env`, nunca no código.
- [ ] Abrir no celular, entrar, rodar um cenário inteiro até "Aprovar".
- [ ] Combinar com a dona do salão onde ela recebe a senha.
