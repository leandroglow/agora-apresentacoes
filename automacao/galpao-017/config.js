window.GALPAO_CONFIG={
  "api": "https://project-pyfyj.vercel.app/api/ha-galpao",
  "clerkPublishableKey": "pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA",
  "card": {
    "type": "custom:agora-property-card",
    "project": "galpao_017",
    "title": "Galpão 017",
    "subtitle": "Tudo pronto para o seu dia.",
    "groups": [
      {
        "title": "Galpão · Acionamentos",
        "items": [
          {
            "id": "switch.galpao_switch_1",
            "label": "Galpão 1",
            "icon": "mdi:power"
          },
          {
            "id": "switch.wifi_breaker_2_switch_1",
            "label": "Galpão 2",
            "icon": "mdi:power"
          },
          {
            "id": "switch.psw_2ch_cb2s_switch_1",
            "label": "CDL-AC20-1",
            "icon": "mdi:power"
          },
          {
            "id": "switch.psw_2ch_cb2s_switch_2",
            "label": "CDL-AC20-2",
            "icon": "mdi:power"
          }
        ]
      },
      {
        "title": "Portão",
        "items": [
          {
            "id": "scene.abrir_portao",
            "label": "Abrir portão",
            "icon": "mdi:gate-open"
          },
          {
            "id": "scene.pausar_portao",
            "label": "Pausar portão",
            "icon": "mdi:pause"
          },
          {
            "id": "scene.fechar_portao",
            "label": "Fechar portão",
            "icon": "mdi:gate"
          }
        ]
      },
      {
        "title": "Ciclo do dia",
        "items": [
          {
            "id": "sensor.sun_next_dawn",
            "label": "Amanhecer",
            "icon": "mdi:weather-sunset"
          },
          {
            "id": "sensor.sun_next_rising",
            "label": "Nascer do sol",
            "icon": "mdi:weather-sunset"
          },
          {
            "id": "sensor.sun_next_noon",
            "label": "Meio-dia",
            "icon": "mdi:weather-sunset"
          },
          {
            "id": "sensor.sun_next_setting",
            "label": "Pôr do sol",
            "icon": "mdi:weather-sunset"
          },
          {
            "id": "sensor.sun_next_dusk",
            "label": "Anoitecer",
            "icon": "mdi:weather-sunset"
          }
        ]
      }
    ]
  }
};
