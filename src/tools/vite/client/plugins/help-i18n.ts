interface HelpTranslations {
  sections: {
    properties: string;
    credentials: string;
    input: string;
    output: string;
    outputs: string;
    port: string;
    settings: string;
    complete: string;
    capabilities: string;
  };
  // Row labels for the Capabilities table. The VALUES (`error`/`complete`/
  // `status`, `true`/`false`) stay canonical across locales — the literal names
  // used when wiring/configuring — which also helps AI retrieval.
  capabilities: {
    lifecyclePorts: string;
    customOutputContext: string;
    customOutputProperty: string;
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
}

const translations: Record<string, HelpTranslations> = {
  "en-US": {
    sections: {
      properties: "Properties",
      credentials: "Credentials",
      input: "Input",
      output: "Output",
      outputs: "Outputs",
      port: "Port",
      settings: "Settings",
      complete: "Complete",
      capabilities: "Capabilities",
    },
    capabilities: {
      lifecyclePorts: "Lifecycle ports",
      customOutputContext: "Custom Output Context",
      customOutputProperty: "Custom Output Property",
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
  },
  de: {
    sections: {
      properties: "Eigenschaften",
      credentials: "Zugangsdaten",
      input: "Eingang",
      output: "Ausgang",
      outputs: "Ausgänge",
      port: "Port",
      settings: "Einstellungen",
      complete: "Abschluss",
      capabilities: "Funktionen",
    },
    capabilities: {
      lifecyclePorts: "Lebenszyklus-Ports",
      customOutputContext: "Angepasster Ausgabekontext",
      customOutputProperty: "Angepasste Ausgabe-Eigenschaft",
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
  },
  "es-ES": {
    sections: {
      properties: "Propiedades",
      credentials: "Credenciales",
      input: "Entrada",
      output: "Salida",
      outputs: "Salidas",
      port: "Puerto",
      settings: "Configuración",
      complete: "Completado",
      capabilities: "Capacidades",
    },
    capabilities: {
      lifecyclePorts: "Puertos de ciclo de vida",
      customOutputContext: "Contexto de salida personalizado",
      customOutputProperty: "Propiedad de salida personalizada",
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
  },
  fr: {
    sections: {
      properties: "Propriétés",
      credentials: "Identifiants",
      input: "Entrée",
      output: "Sortie",
      outputs: "Sorties",
      port: "Port",
      settings: "Paramètres",
      complete: "Terminé",
      capabilities: "Capacités",
    },
    capabilities: {
      lifecyclePorts: "Ports de cycle de vie",
      customOutputContext: "Contexte de sortie personnalisé",
      customOutputProperty: "Propriété de sortie personnalisée",
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
  },
  ko: {
    sections: {
      properties: "속성",
      credentials: "자격 증명",
      input: "입력",
      output: "출력",
      outputs: "출력",
      port: "포트",
      settings: "설정",
      complete: "완료",
      capabilities: "기능",
    },
    capabilities: {
      lifecyclePorts: "라이프사이클 포트",
      customOutputContext: "사용자 지정 출력 컨텍스트",
      customOutputProperty: "사용자 지정 출력 속성",
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
  },
  "pt-BR": {
    sections: {
      properties: "Propriedades",
      credentials: "Credenciais",
      input: "Entrada",
      output: "Saída",
      outputs: "Saídas",
      port: "Porta",
      settings: "Configurações",
      complete: "Concluído",
      capabilities: "Capacidades",
    },
    capabilities: {
      lifecyclePorts: "Portas de ciclo de vida",
      customOutputContext: "Contexto de saída personalizado",
      customOutputProperty: "Propriedade de saída personalizada",
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
  },
  ru: {
    sections: {
      properties: "Свойства",
      credentials: "Учётные данные",
      input: "Вход",
      output: "Выход",
      outputs: "Выходы",
      port: "Порт",
      settings: "Настройки",
      complete: "Завершение",
      capabilities: "Возможности",
    },
    capabilities: {
      lifecyclePorts: "Порты жизненного цикла",
      customOutputContext: "Пользовательский контекст вывода",
      customOutputProperty: "Пользовательское свойство вывода",
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
  },
  ja: {
    sections: {
      properties: "プロパティ",
      credentials: "認証情報",
      input: "入力",
      output: "出力",
      outputs: "出力",
      port: "ポート",
      settings: "設定",
      complete: "完了",
      capabilities: "機能",
    },
    capabilities: {
      lifecyclePorts: "ライフサイクルポート",
      customOutputContext: "カスタム出力コンテキスト",
      customOutputProperty: "カスタム出力プロパティ",
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
  },
  "zh-CN": {
    sections: {
      properties: "属性",
      credentials: "凭证",
      input: "输入",
      output: "输出",
      outputs: "输出",
      port: "端口",
      settings: "设置",
      complete: "完成",
      capabilities: "功能",
    },
    capabilities: {
      lifecyclePorts: "生命周期端口",
      customOutputContext: "自定义输出上下文",
      customOutputProperty: "自定义输出属性",
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
  },
  "zh-TW": {
    sections: {
      properties: "屬性",
      credentials: "憑證",
      input: "輸入",
      output: "輸出",
      outputs: "輸出",
      port: "埠",
      settings: "設定",
      complete: "完成",
      capabilities: "功能",
    },
    capabilities: {
      lifecyclePorts: "生命週期埠",
      customOutputContext: "自訂輸出情境",
      customOutputProperty: "自訂輸出屬性",
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
  },
};

function getHelpTranslations(lang: string): HelpTranslations {
  return translations[lang] ?? translations["en-US"];
}

export { getHelpTranslations };
export type { HelpTranslations };
