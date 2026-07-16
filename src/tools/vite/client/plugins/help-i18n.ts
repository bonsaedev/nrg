interface HelpTranslations {
  sections: {
    configuration: string;
    credentials: string;
    input: string;
    output: string;
    outputs: string;
    port: string;
    settings: string;
  };
  columns: {
    property: string;
    label: string;
    type: string;
    required: string;
    default: string;
    description: string;
  };
  values: {
    yes: string;
    no: string;
  };
  notes: {
    /** Explains the output message envelope (return property + source/input),
     * which the type sections don't otherwise reveal. */
    outputEnvelope: string;
  };
}

const translations: Record<string, HelpTranslations> = {
  "en-US": {
    sections: {
      configuration: "Configuration",
      credentials: "Credentials",
      input: "Input",
      output: "Output",
      outputs: "Outputs",
      port: "Port",
      settings: "Settings",
    },
    columns: {
      property: "Property",
      label: "Label",
      type: "Type",
      required: "Required",
      default: "Default",
      description: "Description",
    },
    values: {
      yes: "Yes",
      no: "No",
    },
    notes: {
      outputEnvelope:
        "Data outputs are placed under the return property (default <code>output</code>). Every port message also carries <code>source</code> (the producing node) and <code>input</code> (the message being processed).",
    },
  },
  de: {
    sections: {
      configuration: "Konfiguration",
      credentials: "Zugangsdaten",
      input: "Eingang",
      output: "Ausgang",
      outputs: "Ausgänge",
      port: "Port",
      settings: "Einstellungen",
    },
    columns: {
      property: "Eigenschaft",
      label: "Bezeichnung",
      type: "Typ",
      required: "Erforderlich",
      default: "Standard",
      description: "Beschreibung",
    },
    values: {
      yes: "Ja",
      no: "Nein",
    },
    notes: {
      outputEnvelope:
        "Datenausgaben werden unter der Rückgabe-Eigenschaft abgelegt (Standard <code>output</code>). Jede Port-Nachricht enthält zudem <code>source</code> (den erzeugenden Node) und <code>input</code> (die verarbeitete Nachricht).",
    },
  },
  "es-ES": {
    sections: {
      configuration: "Configuración",
      credentials: "Credenciales",
      input: "Entrada",
      output: "Salida",
      outputs: "Salidas",
      port: "Puerto",
      settings: "Configuración",
    },
    columns: {
      property: "Propiedad",
      label: "Etiqueta",
      type: "Tipo",
      required: "Requerido",
      default: "Predeterminado",
      description: "Descripción",
    },
    values: {
      yes: "Sí",
      no: "No",
    },
    notes: {
      outputEnvelope:
        "Las salidas de datos se colocan bajo la propiedad de retorno (predeterminado <code>output</code>). Cada mensaje de puerto también incluye <code>source</code> (el nodo que lo produce) e <code>input</code> (el mensaje en proceso).",
    },
  },
  fr: {
    sections: {
      configuration: "Configuration",
      credentials: "Identifiants",
      input: "Entrée",
      output: "Sortie",
      outputs: "Sorties",
      port: "Port",
      settings: "Paramètres",
    },
    columns: {
      property: "Propriété",
      label: "Libellé",
      type: "Type",
      required: "Requis",
      default: "Par défaut",
      description: "Description",
    },
    values: {
      yes: "Oui",
      no: "Non",
    },
    notes: {
      outputEnvelope:
        "Les sorties de données sont placées sous la propriété de retour (par défaut <code>output</code>). Chaque message de port comporte aussi <code>source</code> (le nœud émetteur) et <code>input</code> (le message traité).",
    },
  },
  ko: {
    sections: {
      configuration: "구성",
      credentials: "자격 증명",
      input: "입력",
      output: "출력",
      outputs: "출력",
      port: "포트",
      settings: "설정",
    },
    columns: {
      property: "속성",
      label: "라벨",
      type: "유형",
      required: "필수",
      default: "기본값",
      description: "설명",
    },
    values: {
      yes: "예",
      no: "아니오",
    },
    notes: {
      outputEnvelope:
        "데이터 출력은 반환 속성 아래에 배치됩니다(기본값 <code>output</code>). 모든 포트 메시지에는 <code>source</code>(생성한 노드)와 <code>input</code>(처리 중인 메시지)도 포함됩니다.",
    },
  },
  "pt-BR": {
    sections: {
      configuration: "Configuração",
      credentials: "Credenciais",
      input: "Entrada",
      output: "Saída",
      outputs: "Saídas",
      port: "Porta",
      settings: "Configurações",
    },
    columns: {
      property: "Propriedade",
      label: "Rótulo",
      type: "Tipo",
      required: "Obrigatório",
      default: "Padrão",
      description: "Descrição",
    },
    values: {
      yes: "Sim",
      no: "Não",
    },
    notes: {
      outputEnvelope:
        "As saídas de dados são colocadas sob a propriedade de retorno (padrão <code>output</code>). Cada mensagem de porta também carrega <code>source</code> (o nó de origem) e <code>input</code> (a mensagem em processamento).",
    },
  },
  ru: {
    sections: {
      configuration: "Конфигурация",
      credentials: "Учётные данные",
      input: "Вход",
      output: "Выход",
      outputs: "Выходы",
      port: "Порт",
      settings: "Настройки",
    },
    columns: {
      property: "Свойство",
      label: "Метка",
      type: "Тип",
      required: "Обязательно",
      default: "По умолчанию",
      description: "Описание",
    },
    values: {
      yes: "Да",
      no: "Нет",
    },
    notes: {
      outputEnvelope:
        "Выходные данные помещаются в свойство возврата (по умолчанию <code>output</code>). Каждое сообщение порта также содержит <code>source</code> (узел-источник) и <code>input</code> (обрабатываемое сообщение).",
    },
  },
  ja: {
    sections: {
      configuration: "構成",
      credentials: "認証情報",
      input: "入力",
      output: "出力",
      outputs: "出力",
      port: "ポート",
      settings: "設定",
    },
    columns: {
      property: "プロパティ",
      label: "ラベル",
      type: "型",
      required: "必須",
      default: "デフォルト",
      description: "説明",
    },
    values: {
      yes: "はい",
      no: "いいえ",
    },
    notes: {
      outputEnvelope:
        "データ出力は戻りプロパティ（既定は <code>output</code>）の下に格納されます。各ポートのメッセージには <code>source</code>（生成元ノード）と <code>input</code>（処理中のメッセージ）も含まれます。",
    },
  },
  "zh-CN": {
    sections: {
      configuration: "配置",
      credentials: "凭证",
      input: "输入",
      output: "输出",
      outputs: "输出",
      port: "端口",
      settings: "设置",
    },
    columns: {
      property: "属性",
      label: "标签",
      type: "类型",
      required: "必填",
      default: "默认值",
      description: "描述",
    },
    values: {
      yes: "是",
      no: "否",
    },
    notes: {
      outputEnvelope:
        "数据输出放在返回属性下（默认 <code>output</code>）。每个端口消息还带有 <code>source</code>（产生该消息的节点）和 <code>input</code>（正在处理的消息）。",
    },
  },
  "zh-TW": {
    sections: {
      configuration: "組態",
      credentials: "憑證",
      input: "輸入",
      output: "輸出",
      outputs: "輸出",
      port: "埠",
      settings: "設定",
    },
    columns: {
      property: "屬性",
      label: "標籤",
      type: "類型",
      required: "必填",
      default: "預設值",
      description: "描述",
    },
    values: {
      yes: "是",
      no: "否",
    },
    notes: {
      outputEnvelope:
        "資料輸出置於回傳屬性之下（預設 <code>output</code>）。每個埠訊息也會帶有 <code>source</code>（產生訊息的節點）與 <code>input</code>（正在處理的訊息）。",
    },
  },
};

function getHelpTranslations(lang: string): HelpTranslations {
  return translations[lang] ?? translations["en-US"];
}

export { getHelpTranslations };
export type { HelpTranslations };
