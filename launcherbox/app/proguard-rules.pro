# Sem regras: o launcher não usa reflexão em nada que precise sobreviver ao
# R8. As APIs ocultas que ele chama (getWifiApState) são acessadas por nome de
# método em tempo de execução, mas sobre o framework do sistema, não sobre
# classes deste APK.
