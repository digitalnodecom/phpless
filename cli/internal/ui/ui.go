package ui

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/olekukonko/tablewriter"
	"golang.org/x/term"
)

// JSONMode disables colored output and spinners when true.
var JSONMode bool

var (
	green  = color.New(color.FgGreen)
	red    = color.New(color.FgRed)
	yellow = color.New(color.FgYellow)
	bold   = color.New(color.Bold)
	dim    = color.New(color.Faint)
)

func Success(format string, args ...any) {
	if JSONMode {
		return
	}
	green.Print("✓ ")
	fmt.Printf(format+"\n", args...)
}

func Error(format string, args ...any) {
	if JSONMode {
		return
	}
	red.Print("✗ ")
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

func Warn(format string, args ...any) {
	if JSONMode {
		return
	}
	yellow.Print("! ")
	fmt.Printf(format+"\n", args...)
}

func Info(format string, args ...any) {
	if JSONMode {
		return
	}
	fmt.Printf(format+"\n", args...)
}

func Bold(format string, args ...any) {
	if JSONMode {
		return
	}
	bold.Printf(format+"\n", args...)
}

func Dim(format string, args ...any) {
	if JSONMode {
		return
	}
	dim.Printf(format+"\n", args...)
}

// Prompt reads a line of input from the user.
func Prompt(label string) (string, error) {
	fmt.Print(label)
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(input), nil
}

// PromptPassword reads a password without echoing characters.
func PromptPassword(label string) (string, error) {
	fmt.Print(label)
	pw, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return "", err
	}
	return string(pw), nil
}

// Confirm asks for y/N confirmation and returns true if the user agrees.
func Confirm(prompt string) bool {
	fmt.Printf("%s [y/N] ", prompt)
	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(strings.ToLower(input))
	return input == "y" || input == "yes"
}

// Table renders a borderless table to stdout.
func Table(headers []string, rows [][]string) {
	table := tablewriter.NewWriter(os.Stdout)
	table.SetHeader(headers)
	table.SetBorder(false)
	table.SetHeaderAlignment(tablewriter.ALIGN_LEFT)
	table.SetAlignment(tablewriter.ALIGN_LEFT)
	table.SetCenterSeparator("")
	table.SetColumnSeparator("")
	table.SetRowSeparator("")
	table.SetHeaderLine(false)
	table.SetTablePadding("  ")
	table.SetNoWhiteSpace(true)
	table.AppendBulk(rows)
	table.Render()
}

// Spinner shows a braille-character spinner with a message.
type Spinner struct {
	message string
	stop    chan struct{}
	done    chan struct{}
}

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

func NewSpinner(message string) *Spinner {
	return &Spinner{
		message: message,
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}
}

func (s *Spinner) Start() {
	if JSONMode {
		return
	}
	go func() {
		defer close(s.done)
		i := 0
		for {
			select {
			case <-s.stop:
				fmt.Print("\r\033[K")
				return
			default:
				yellow.Printf("\r%s ", spinnerFrames[i%len(spinnerFrames)])
				fmt.Print(s.message)
				i++
				time.Sleep(80 * time.Millisecond)
			}
		}
	}()
}

func (s *Spinner) Stop() {
	if JSONMode {
		return
	}
	close(s.stop)
	<-s.done
}
