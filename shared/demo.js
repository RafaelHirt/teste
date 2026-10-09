export function demoSnapshot(now = new Date()) {
  const year = now.getFullYear();
  const source = [
    [
      "Hospital Estadual de Goiânia",
      "Goiânia",
      845000,
      7605000,
      2535000,
      18500,
    ],
    ["Unidade Regional de Anápolis", "Anápolis", 524000, 4716000, 0, 7200],
    [
      "Hospital Regional de Rio Verde",
      "Rio Verde",
      418000,
      3762000,
      1254000,
      9800,
    ],
    [
      "Unidade de Aparecida de Goiânia",
      "Aparecida de Goiânia",
      392000,
      3528000,
      1176000,
      4600,
    ],
    ["Unidade Regional de Catalão", "Catalão", 276000, 2484000, 0, 3200],
    [
      "Hospital Regional de Itumbiara",
      "Itumbiara",
      310000,
      2790000,
      930000,
      5400,
    ],
    ["Unidade Regional de Jataí", "Jataí", 224000, 2016000, 672000, 2800],
    [
      "Unidade Regional de Luziânia",
      "Luziânia",
      365000,
      3285000,
      1095000,
      6700,
    ],
    ["Unidade Regional de Formosa", "Formosa", 248000, 2232000, 744000, 3900],
    ["Unidade Regional de Uruaçu", "Uruaçu", 187000, 1683000, 0, 1500],
    [
      "Unidade Regional de Porangatu",
      "Porangatu",
      162000,
      1458000,
      486000,
      2200,
    ],
    [
      "Centro de Atendimento de Goiânia",
      "Goiânia",
      134000,
      1206000,
      402000,
      1800,
    ],
  ];
  return {
    records: source.map(
      (
        [unit, municipality, monthly, committed, remaining, deduction],
        index,
      ) => ({
        id: `demo-${index}`,
        unit,
        municipality,
        monthly,
        committed,
        remaining,
        deduction,
        start: `${year}-01-01`,
        end: index === 1 ? `${year}-11-30` : `${year}-12-31`,
      }),
    ),
    updatedAt: null,
    source: { kind: "demo", tab: "Demonstração" },
    stale: false,
    warnings: [],
    columns: {},
  };
}
