package server

import (
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// PruneEntry is a candidate file for retention pruning: its name and mod time.
type PruneEntry struct {
	Name    string
	ModTime time.Time
}

// PlanPrune is a pure function that decides which files to delete. It considers
// only names ending in ".png". If retainDays > 0, entries older than
// now-retainDays are pruned. If retainMax > 0, after age pruning, all but the
// newest retainMax survivors are pruned. Both 0 means nothing is pruned. The
// returned order is deterministic (ties broken by name).
func PlanPrune(entries []PruneEntry, now time.Time, retainDays, retainMax int) []string {
	if retainDays <= 0 && retainMax <= 0 {
		return nil
	}

	// Consider only .png files, working on a sorted copy so results are stable.
	pngs := make([]PruneEntry, 0, len(entries))
	for _, e := range entries {
		if strings.HasSuffix(e.Name, ".png") {
			pngs = append(pngs, e)
		}
	}
	sort.Slice(pngs, func(i, j int) bool {
		if pngs[i].ModTime.Equal(pngs[j].ModTime) {
			return pngs[i].Name < pngs[j].Name
		}
		return pngs[i].ModTime.After(pngs[j].ModTime) // newest first
	})

	var prune []string
	survivors := make([]PruneEntry, 0, len(pngs))

	if retainDays > 0 {
		cutoff := now.AddDate(0, 0, -retainDays)
		for _, e := range pngs {
			if e.ModTime.Before(cutoff) {
				prune = append(prune, e.Name)
			} else {
				survivors = append(survivors, e)
			}
		}
	} else {
		survivors = pngs
	}

	if retainMax > 0 && len(survivors) > retainMax {
		// survivors is newest-first; keep the first retainMax, prune the rest.
		for _, e := range survivors[retainMax:] {
			prune = append(prune, e.Name)
		}
	}

	return prune
}

// PruneDir lists dir (top level only, never following symlinks), applies
// PlanPrune, removes the planned files, and logs how many were removed. Errors
// on individual entries are logged but do not abort the sweep.
func PruneDir(dir string, now time.Time, retainDays, retainMax int) {
	if retainDays <= 0 && retainMax <= 0 {
		return
	}

	dirEntries, err := os.ReadDir(dir)
	if err != nil {
		log.Printf("retention: cannot read dir %q: %v", dir, err)
		return
	}

	entries := make([]PruneEntry, 0, len(dirEntries))
	for _, de := range dirEntries {
		// Skip anything that is not a regular file (directories, symlinks, etc.).
		if de.Type()&(os.ModeSymlink|os.ModeDir) != 0 || !de.Type().IsRegular() {
			continue
		}
		info, err := de.Info()
		if err != nil {
			continue
		}
		entries = append(entries, PruneEntry{Name: de.Name(), ModTime: info.ModTime()})
	}

	toPrune := PlanPrune(entries, now, retainDays, retainMax)
	removed := 0
	for _, name := range toPrune {
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			log.Printf("retention: could not remove %q: %v", name, err)
			continue
		}
		removed++
	}
	if removed > 0 {
		log.Printf("retention: pruned %d file(s) from %s", removed, dir)
	}
}
