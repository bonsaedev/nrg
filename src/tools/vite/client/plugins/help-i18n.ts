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
    /** Explains how a node's output fields land on the message record (merged at
     * the root; provenance on msg[Meta].source), which the type sections don't
     * otherwise reveal. */
    outputRecord: string;
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
      outputRecord:
        "Output fields are merged onto the message record — a downstream node reads them at the root (e.g. <code>msg.payload</code>). The producing node is recorded on <code>msg[Meta].source</code>.",
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
      outputRecord:
        "Ausgabefelder werden in den Nachrichten-Datensatz eingemischt — nachgelagerte Nodes lesen sie an der Wurzel (z. B. <code>msg.payload</code>). Der erzeugende Node wird in <code>msg[Meta].source</code> festgehalten.",
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
      outputRecord:
        "Los campos de salida se fusionan en el registro del mensaje: los nodos posteriores los leen en la raíz (p. ej. <code>msg.payload</code>). El nodo que los produce queda registrado en <code>msg[Meta].source</code>.",
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
      outputRecord:
        "Les champs de sortie sont fusionnés dans l'enregistrement du message — les nœuds en aval les lisent à la racine (par ex. <code>msg.payload</code>). Le nœud émetteur est indiqué dans <code>msg[Meta].source</code>.",
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
      outputRecord:
        "출력 필드는 메시지 레코드에 병합됩니다 — 다운스트림 노드는 루트에서 읽습니다(예: <code>msg.payload</code>). 생성한 노드는 <code>msg[Meta].source</code>에 기록됩니다.",
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
      outputRecord:
        "Os campos de saída são mesclados no registro da mensagem — os nós posteriores os leem na raiz (por ex. <code>msg.payload</code>). O nó de origem fica registrado em <code>msg[Meta].source</code>.",
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
      outputRecord:
        "Поля вывода объединяются в запись сообщения — последующие узлы читают их в корне (например, <code>msg.payload</code>). Узел-источник фиксируется в <code>msg[Meta].source</code>.",
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
      outputRecord:
        "出力フィールドはメッセージレコードにマージされます。下流のノードはルートで読み取ります（例: <code>msg.payload</code>）。生成元ノードは <code>msg[Meta].source</code> に記録されます。",
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
      outputRecord:
        "输出字段会合并到消息记录中——下游节点在根级读取它们（例如 <code>msg.payload</code>）。产生该消息的节点记录在 <code>msg[Meta].source</code> 中。",
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
      outputRecord:
        "輸出欄位會合併到訊息記錄中——下游節點於根層級讀取（例如 <code>msg.payload</code>）。產生訊息的節點記錄在 <code>msg[Meta].source</code>。",
    },
  },
};

function getHelpTranslations(lang: string): HelpTranslations {
  return translations[lang] ?? translations["en-US"];
}

export { getHelpTranslations };
export type { HelpTranslations };
