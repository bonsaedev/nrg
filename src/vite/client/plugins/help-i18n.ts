interface HelpTranslations {
  sections: {
    properties: string;
    credentials: string;
    input: string;
    output: string;
    outputs: string;
    port: string;
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
