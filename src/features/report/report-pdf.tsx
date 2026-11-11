/**
 * The progress report as a PDF (@react-pdf/renderer). This module is only
 * loaded when the student asks for the PDF, and it is built in the browser,
 * so it works offline. Helvetica is built into every PDF reader, so no fonts
 * need downloading.
 */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ReportData } from "@/lib/tracker/report";

const C = { ink: "#18181b", muted: "#52525b", line: "#e4e4e7", accent: "#4f46e5", done: "#047857", work: "#b45309", soft: "#eef2ff", track: "#f4f4f5" };

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: C.ink, lineHeight: 1.4 },
  cover: { padding: 0, fontFamily: "Helvetica", color: C.ink },
  band: { backgroundColor: C.accent, color: "#ffffff", paddingVertical: 60, paddingHorizontal: 48 },
  kicker: { fontSize: 11, color: "#c7d2fe", marginBottom: 6 },
  title: { fontSize: 30, fontFamily: "Helvetica-Bold" },
  coverBody: { padding: 48 },
  big: { fontSize: 44, fontFamily: "Helvetica-Bold", color: C.accent },
  h2: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 4 },
  h3: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  muted: { color: C.muted },
  row: { flexDirection: "row", alignItems: "center" },
  tiles: { flexDirection: "row", gap: 10, marginTop: 24 },
  tile: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12 },
  tileNum: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, backgroundColor: C.track, overflow: "hidden", marginTop: 6 },
  subject: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12, marginBottom: 10 },
  li: { flexDirection: "row", marginTop: 2 },
  dot: { width: 10, color: C.work },
  table: { borderTopWidth: 1, borderColor: C.line, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.line, paddingVertical: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

function Bar({ counts }: { counts: readonly [number, number, number] }) {
  const total = counts[0] + counts[1] + counts[2] || 1;
  return (
    <View style={s.bar}>
      <View style={{ width: `${(100 * counts[2]) / total}%`, backgroundColor: C.done }} />
      <View style={{ width: `${(100 * counts[1]) / total}%`, backgroundColor: C.work }} />
    </View>
  );
}

function Footer({ data }: { data: ReportData }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        GCSE Spec Tracker · {data.email} · {data.date}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const started = data.subjects.filter((x) => x.counts[1] + x.counts[2] > 0);
  return (
    <Document title={`GCSE progress report - ${data.date}`} author={data.email} subject="GCSE Spec Tracker progress report" creator="GCSE Spec Tracker" producer="GCSE Spec Tracker">
      <Page size="A4" style={s.cover}>
        <View style={s.band}>
          <Text style={s.kicker}>GCSE Spec Tracker</Text>
          <Text style={s.title}>Progress report</Text>
          <Text style={{ marginTop: 10, fontSize: 12 }}>
            {data.email} · {data.date}
          </Text>
        </View>
        <View style={s.coverBody}>
          <Text style={s.muted}>Spec points marked done, across every subject</Text>
          <Text style={s.big}>{data.overall.mastery}%</Text>
          <Bar counts={data.overall.counts} />
          <Text style={[s.muted, { marginTop: 6 }]}>
            {data.overall.counts[2]} done · {data.overall.counts[1]} need work · {data.overall.counts[0]} not done · {data.overall.total} in total
          </Text>
          <View style={s.tiles}>
            <View style={s.tile}>
              <Text style={s.tileNum}>{data.answered}</Text>
              <Text style={s.muted}>questions answered</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileNum}>{data.marksPct === null ? "-" : `${data.marksPct}%`}</Text>
              <Text style={s.muted}>of marks gained</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileNum}>{data.streak}</Text>
              <Text style={s.muted}>{data.streak === 1 ? "day streak" : "days streak"}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileNum}>{data.studyWeek}</Text>
              <Text style={s.muted}>studied this week ({data.studyTotal} in total)</Text>
            </View>
          </View>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Mastery by subject</Text>
        {data.subjects.map((x) => (
          <View key={x.sid} style={s.subject} wrap={false}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={s.h3}>
                {x.board} {x.name} <Text style={s.muted}>({x.code})</Text>
              </Text>
              <Text style={s.h3}>{x.mastery}%</Text>
            </View>
            <Bar counts={x.counts} />
            <Text style={[s.muted, { marginTop: 4 }]}>
              {x.counts[2]} done · {x.counts[1]} need work · {x.counts[0]} not done
            </Text>
          </View>
        ))}
        <Footer data={data} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Needs work</Text>
        {started.some((x) => x.needsWork.length) ? (
          started
            .filter((x) => x.needsWork.length)
            .map((x) => (
              <View key={x.sid} style={{ marginBottom: 10 }}>
                <Text style={s.h3}>{x.name}</Text>
                {x.needsWork.map((label, i) => (
                  <View key={i} style={s.li}>
                    <Text style={s.dot}>•</Text>
                    <Text style={{ flex: 1 }}>{label}</Text>
                  </View>
                ))}
              </View>
            ))
        ) : (
          <Text style={s.muted}>Nothing is marked Needs work right now.</Text>
        )}

        <Text style={[s.h2, { marginTop: 16 }]}>Recent marks</Text>
        {data.recentMarks.length ? (
          <View style={s.table}>
            {data.recentMarks.map((m, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={{ width: 50, color: C.muted }}>{m.day}</Text>
                <Text style={{ width: 80 }}>{m.subject}</Text>
                <Text style={{ flex: 1 }}>{m.label}</Text>
                <Text style={{ width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" }}>
                  {m.aw}/{m.mx}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.muted}>No marked answers yet. Try Today&apos;s 7.</Text>
        )}
        <Footer data={data} />
      </Page>
    </Document>
  );
}
