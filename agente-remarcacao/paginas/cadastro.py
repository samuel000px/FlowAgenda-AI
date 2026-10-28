"""Clientes e equipe: os números de cada cliente e quem prefere qual profissional. Só leitura, com senha."""
import pandas as pd
import streamlit as st

from paginas.comum import exigir_senha, menu_do_painel
from src.dados import carregar_clientes, carregar_profissionais
from src.historico import Historico, aplicar
from src.score import prob_aceitar, taxa_falta

exigir_senha()
menu_do_painel()

st.markdown("### Clientes e equipe")
profissionais = carregar_profissionais()
clientes = carregar_clientes(profissionais=profissionais)
somar = st.toggle("Somar o que já foi registrado no histórico", help="Visitas, faltas e propostas de registro/historico.csv.")
if somar:
    clientes = aplicar(clientes, Historico().eventos())

st.markdown("#### Clientes")
st.caption("Taxa de falta e chance de aceitar são calculadas pelo código, as mesmas que o agente usa.")
st.dataframe(
    pd.DataFrame(
        {
            "Cliente": c.nome,
            "Serviço": "Pé e mão" if c.tipo_atendimento == "pe_e_mao" else "Manicure",
            "Prefere": profissionais.get(c.profissional_preferida, "qualquer uma"),
            "Visitas": c.consultas_total,
            "Faltas": c.faltas,
            "Taxa de falta": f"{taxa_falta(c.faltas, c.consultas_total):.0%}",
            "Propostas": f"{c.propostas_aceitas} de {c.propostas_recebidas} aceitas",
            "Disposição": "não chamar" if c.disposicao == 0 else f"{c.disposicao}/10",
            "Chance de aceitar": f"{prob_aceitar(c.propostas_aceitas, c.propostas_recebidas, c.disposicao):.0%}",
        }
        for c in sorted(clientes.values(), key=lambda c: c.nome)
    ),
    hide_index=True,
    use_container_width=True,
)

st.markdown("#### Equipe")
st.dataframe(
    pd.DataFrame(
        {"Profissional": nome, "Clientes que preferem": sum(c.profissional_preferida == pid for c in clientes.values())}
        for pid, nome in profissionais.items()
    ),
    hide_index=True,
)
st.caption("Por enquanto o cadastro é lido de data/clientes.json. Editar por aqui fica para quando ele for para o Google Planilhas.")
