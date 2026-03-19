package com.example.hiddenvault

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import net.objecthunter.exp4j.ExpressionBuilder

class MainActivity : AppCompatActivity() {

    private lateinit var display: TextView
    private var currentInput = ""
    private var pin = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val sharedPref = getSharedPreferences("VaultPrefs", Context.MODE_PRIVATE)
        pin = sharedPref.getString("PIN", "") ?: ""

        if (pin.isEmpty()) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
        }

        display = findViewById(R.id.tvDisplay)

        // Setup button listeners (0-9, +, -, *, /, =, C)
        setupButtons()
    }

    private fun setupButtons() {
        val buttons = listOf(
            R.id.btn0, R.id.btn1, R.id.btn2, R.id.btn3, R.id.btn4,
            R.id.btn5, R.id.btn6, R.id.btn7, R.id.btn8, R.id.btn9,
            R.id.btnAdd, R.id.btnSub, R.id.btnMul, R.id.btnDiv,
            R.id.btnEqual, R.id.btnClear
        )

        for (id in buttons) {
            findViewById<Button>(id).setOnClickListener {
                val btn = it as Button
                handleInput(btn.text.toString())
            }
        }
    }

    private fun handleInput(input: String) {
        when (input) {
            "C" -> {
                currentInput = ""
                display.text = "0"
            }
            "=" -> {
                if (currentInput == pin) {
                    startActivity(Intent(this, VaultActivity::class.java))
                    currentInput = ""
                    display.text = "0"
                } else {
                    evaluateExpression()
                }
            }
            else -> {
                currentInput += input
                display.text = currentInput
            }
        }
    }

    private fun evaluateExpression() {
        try {
            val expression = ExpressionBuilder(currentInput).build()
            val result = expression.evaluate()
            display.text = result.toString()
            currentInput = result.toString()
        } catch (e: Exception) {
            display.text = "Error"
            currentInput = ""
        }
    }
}
