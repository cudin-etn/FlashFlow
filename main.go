package main

import (
	"embed"
	"runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	appOptions := &options.App{
		Title: "FlashFlow",

		Width:     1024,
		Height:    768,
		MinWidth:  900,
		MinHeight: 600,

		// Frameless on Windows — removes title bar, Win 11 auto-rounds corners
		Frameless: runtime.GOOS == "windows",

		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},

		// macOS: hidden title bar with inset traffic lights — content flows to top
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title: "FlashFlow",
			},
		},
	}

	err := wails.Run(appOptions)
	if err != nil {
		println("Error:", err.Error())
	}
}
