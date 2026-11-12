package sample

import (
	"fmt"
	"os"
	fp "path/filepath"
)

import "strings"

const DefaultDepth = 3

var cache = map[string]int{}

type Level int

type Element struct {
	ID    string
	Level Level
}

type Describer interface {
	Describe() string
}

func (e Element) Describe() string {
	return fmt.Sprintf("%d:%s", e.Level, strings.ToLower(e.ID))
}

func CountFiles(root string) (int, error) {
	n := 0
	err := fp.Walk(root, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			n++
		}
		return err
	})
	cache[root] = n
	return n, err
}
