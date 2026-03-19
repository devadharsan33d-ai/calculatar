package com.example.hiddenvault

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SetupActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        val etPin = findViewById<EditText>(R.id.etPin)
        val etEmail = findViewById<EditText>(R.id.etEmail)
        val btnSave = findViewById<Button>(R.id.btnSave)

        btnSave.setOnClickListener {
            val pin = etPin.text.toString()
            val email = etEmail.text.toString()

            if (pin.length >= 4 && email.contains("@")) {
                val sharedPref = getSharedPreferences("VaultPrefs", Context.MODE_PRIVATE)
                with(sharedPref.edit()) {
                    putString("PIN", pin)
                    putString("EMAIL", email)
                    apply()
                }
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            } else {
                Toast.makeText(this, "Invalid PIN or Email", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
