export const sampleJson = {
  registry: "Copperline County Claims Office",
  season: "1889",
  updated: "1889-04-02T09:15:00Z",
  claims: [
    {
      id: "CLM-0142",
      claimant: {
        name: "Odessa Marrow",
        license: "PR-8834",
        yearsActive: 6,
        contact: { wire: "COPPERLINE-4", camp: "Willow Bend" },
      },
      site: { creek: "Widow's Creek", section: 12, elevationFt: 4210 },
      minerals: ["gold", "trace silver"],
      status: "active",
      yieldOz: 3.4,
      lastAssay: { date: "1889-03-11", assayer: "T. Halloway", purity: 0.91 },
      flagged: false,
      notes: null,
    },
    {
      id: "CLM-0143",
      claimant: {
        name: "Bartholomew Quince",
        license: "PR-7710",
        yearsActive: 14,
        contact: { wire: "COPPERLINE-1", camp: "Ember Flats" },
      },
      site: { creek: "Widow's Creek", section: 14, elevationFt: 4185 },
      minerals: ["gold"],
      status: "active",
      yieldOz: 11.2,
      lastAssay: { date: "1889-03-29", assayer: "T. Halloway", purity: 0.94 },
      flagged: true,
      notes: "Vein widens past the second sluice gate.",
    },
    {
      id: "CLM-0144",
      claimant: {
        name: "Odessa Marrow",
        license: "PR-8834",
        yearsActive: 6,
        contact: { wire: "COPPERLINE-4", camp: "Willow Bend" },
      },
      site: { creek: "Pilcher Run", section: 3, elevationFt: 3960 },
      minerals: ["silver", "lead"],
      status: "dormant",
      yieldOz: 0,
      lastAssay: null,
      flagged: false,
      notes: "Idle since the November freeze.",
    },
  ],
  equipment: {
    sluices: 4,
    pans: 22,
    rockers: 2,
    inspector: { name: "Franklin Ide", badge: "INS-09", email: "f.ide@copperline.gov" },
  },
  weather: { tempF: 58, conditions: "overcast", riverLevel: "normal" },
};

export const sampleJsonText = JSON.stringify(sampleJson, null, 2);
