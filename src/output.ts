import ora, { Ora } from "ora"
import kleur from "kleur"
import { default as wrapAnsi } from "wrap-ansi"
import { last, without } from "lodash-es"
import figures from "figures"

let loadersStack: InternalLoader[] = []

export interface Loader {
  setText(text: string): void
  fail(message?: string): void
  failAndExit(message?: string): never
  stop(): void
}

export interface InternalLoader extends Loader {
  spinner: Ora
  isActive: boolean
  state: "running" | "stopped" | "should_fail"
  text: string
  activate(): void
  deactivate(): void
}

export const output = {
  async withLoading<T>(promise: Promise<T>, options: string | {
    text: string
    exitOnError?: boolean,
    getErrorMessage?: (e: Error) => string,
  }): Promise<T> {
    const actualOptions = typeof options === "string" ? {
      text: options,
      exitOnError: true
    } : {
      text: options.text,
      exitOnError: options.exitOnError ?? true,
      getErrorMessage: options.getErrorMessage ?? (options.exitOnError !== false ? ((e: Error) => e.message) : undefined)
    }

    const loader = this.startLoading(actualOptions.text)

    try {
      const result = await promise
      loader.stop()
      return result
    } catch (e: unknown) {
      const error = e as Error

      if (actualOptions.exitOnError) {
        if (actualOptions.getErrorMessage) loader.failAndExit(actualOptions.getErrorMessage(error))
        else loader.failAndExit()
      } else {
        if (actualOptions.getErrorMessage) loader.fail(actualOptions.getErrorMessage(error))
        else loader.fail()
      }

      throw e
    }
  },
  startLoading(text: string): Loader {
    const loader: InternalLoader = {
      isActive: false,
      state: "running",
      text,
      spinner: ora({
        spinner: "dots4",
        color: "blue",
        prefixText: "\n"
      }),
      fail(message?: string) {
        if (this.state !== "running") throw new Error("state is not 'running'")

        if (message !== undefined) this.text = this.text + " — " + kleur.red(message)

        if (this.isActive) {
          this.spinner.fail(this.text)
          this.stop()
        } else {
          this.state = "should_fail"
        }
      },
      failAndExit(message?: string): never {
        if (this.state !== "running") throw new Error("state is not 'running'")

        if (message !== undefined) this.text = this.text + " — " + kleur.red(message)

        if (!this.isActive) {
          last(loadersStack)?.deactivate()
        }

        this.spinner.fail(this.text)

        process.exit(1)
      },
      setText(text: string) {
        if (this.state !== "running") throw new Error("state is not 'running'")

        this.text = text
      },
      stop() {
        this.state = "stopped"

        if (this.isActive) this.spinner.stop()
        loadersStack = without(loadersStack, this)
        last(loadersStack)?.activate()
      },
      activate() {
        if (!this.isActive) {
          this.isActive = true

          if (this.state === "should_fail") {
            this.spinner.fail(this.text)
            this.stop()
          } else if (this.state === "running") this.spinner.start(this.text)
        }
      },
      deactivate() {
        if (this.isActive) {
          this.isActive = false

          if (this.state === "running") this.spinner.stop()
        }
      }
    }

    last(loadersStack)?.deactivate()
    loadersStack.push(loader)
    loader.activate()

    return loader
  },
  print(text: string) {
    const loader = last(loadersStack)
    if (loader === undefined) {
      process.stdout.write(text)
    } else {
      loader.deactivate()
      process.stdout.write(text)
      loader.activate()
    }
  },
  println(text: string) {
    this.print(text + "\n")
  },
  printlnWrapping(text: string) {
    this.println(wrapAnsi(text, process.stdout.columns))
  },
  warn(text: string) {
    this.printlnWrapping(`${kleur.yellow(figures.pointer)} ${text}`)
  },
  fail(text: string) {
    last(loadersStack)?.fail()
    this.printlnWrapping(`${kleur.red(figures.pointer)} ${text}`)
  },
  failAndExit(text: string): never {
    this.fail(text)
    process.exit(1)
  }
}
