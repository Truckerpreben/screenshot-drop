package server

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
	"time"
)

var pruneNow = time.Date(2026, 7, 4, 12, 0, 0, 0, time.UTC)

func day(y, m, d int) time.Time {
	return time.Date(y, time.Month(m), d, 12, 0, 0, 0, time.UTC)
}

func sortedSet(names []string) []string {
	out := append([]string(nil), names...)
	sort.Strings(out)
	return out
}

func TestPlanPruneBothDisabled(t *testing.T) {
	entries := []PruneEntry{
		{Name: "a.png", ModTime: day(2020, 1, 1)},
		{Name: "b.png", ModTime: day(2026, 7, 4)},
	}
	got := PlanPrune(entries, pruneNow, 0, 0)
	if len(got) != 0 {
		t.Errorf("expected no prunes when both disabled, got %v", got)
	}
}

func TestPlanPruneByAge(t *testing.T) {
	entries := []PruneEntry{
		{Name: "old.png", ModTime: day(2026, 6, 1)},   // older than 7 days -> prune
		{Name: "edge.png", ModTime: day(2026, 6, 27)}, // exactly cutoff -> keep (not strictly older)
		{Name: "recent.png", ModTime: day(2026, 7, 3)},
	}
	got := sortedSet(PlanPrune(entries, pruneNow, 7, 0))
	want := []string{"old.png"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("PlanPrune age = %v, want %v", got, want)
	}
}

func TestPlanPruneByCount(t *testing.T) {
	entries := []PruneEntry{
		{Name: "a.png", ModTime: day(2026, 7, 1)},
		{Name: "b.png", ModTime: day(2026, 7, 2)},
		{Name: "c.png", ModTime: day(2026, 7, 3)},
		{Name: "d.png", ModTime: day(2026, 7, 4)},
	}
	got := sortedSet(PlanPrune(entries, pruneNow, 0, 2))
	want := []string{"a.png", "b.png"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("PlanPrune count = %v, want %v", got, want)
	}
}

func TestPlanPruneCombinedAgeThenCount(t *testing.T) {
	entries := []PruneEntry{
		{Name: "old.png", ModTime: day(2026, 6, 1)}, // age-pruned
		{Name: "mid.png", ModTime: day(2026, 7, 1)}, // survives age, count-pruned
		{Name: "new.png", ModTime: day(2026, 7, 3)}, // survives, kept
	}
	got := sortedSet(PlanPrune(entries, pruneNow, 7, 1))
	want := []string{"mid.png", "old.png"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("PlanPrune combined = %v, want %v", got, want)
	}
}

func TestPlanPruneIgnoresNonPNG(t *testing.T) {
	entries := []PruneEntry{
		{Name: "keep.txt", ModTime: day(2000, 1, 1)}, // ancient but not .png -> ignored
		{Name: "old.png", ModTime: day(2026, 6, 1)},
	}
	got := sortedSet(PlanPrune(entries, pruneNow, 1, 0))
	want := []string{"old.png"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("PlanPrune non-png = %v, want %v", got, want)
	}
}

func TestPlanPruneStableOnTies(t *testing.T) {
	entries := []PruneEntry{
		{Name: "b.png", ModTime: day(2026, 7, 1)},
		{Name: "a.png", ModTime: day(2026, 7, 1)}, // same ModTime as b
	}
	first := PlanPrune(entries, pruneNow, 0, 1)
	second := PlanPrune(entries, pruneNow, 0, 1)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("PlanPrune not deterministic on ties: %v vs %v", first, second)
	}
	// Tie-break by name: keep the newest one, with "a.png" sorting first as kept.
	if len(first) != 1 || first[0] != "b.png" {
		t.Errorf("PlanPrune tie result = %v, want [b.png]", first)
	}
}

func TestPruneDirRemovesPlannedByCount(t *testing.T) {
	dir := t.TempDir()
	names := []string{"a.png", "b.png", "c.png"}
	for i, n := range names {
		p := filepath.Join(dir, n)
		if err := os.WriteFile(p, []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		// Stagger mod times so a is oldest, c is newest.
		mt := day(2026, 7, 1).Add(time.Duration(i) * time.Hour)
		if err := os.Chtimes(p, mt, mt); err != nil {
			t.Fatal(err)
		}
	}
	PruneDir(dir, pruneNow, 0, 1) // keep newest 1 -> c.png

	remaining, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 1 || remaining[0].Name() != "c.png" {
		got := make([]string, len(remaining))
		for i, e := range remaining {
			got[i] = e.Name()
		}
		t.Errorf("after prune dir has %v, want [c.png]", got)
	}
}

func TestPruneDirSkipsSubdirsAndNonPNG(t *testing.T) {
	dir := t.TempDir()
	// A subdirectory (even an ancient-looking name) must never be removed.
	sub := filepath.Join(dir, "keep.png") // .png suffix but it is a directory
	if err := os.Mkdir(sub, 0755); err != nil {
		t.Fatal(err)
	}
	txt := filepath.Join(dir, "notes.txt")
	if err := os.WriteFile(txt, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	old := filepath.Join(dir, "old.png")
	if err := os.WriteFile(old, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	oldMod := day(2026, 6, 1)
	if err := os.Chtimes(old, oldMod, oldMod); err != nil {
		t.Fatal(err)
	}

	PruneDir(dir, pruneNow, 7, 0) // age prune: only old.png should go

	if _, err := os.Stat(sub); err != nil {
		t.Errorf("subdirectory keep.png was removed or unreadable: %v", err)
	}
	if _, err := os.Stat(txt); err != nil {
		t.Errorf("non-png notes.txt was removed: %v", err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Errorf("old.png should have been pruned, stat err = %v", err)
	}
}
