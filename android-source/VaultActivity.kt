package com.example.hiddenvault

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.io.File
import java.io.FileOutputStream

class VaultActivity : AppCompatActivity() {

    private lateinit var recyclerView: RecyclerView
    private val PICK_IMAGE = 100

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_vault)

        recyclerView = findViewById(R.id.rvVault)
        recyclerView.layoutManager = GridLayoutManager(this, 3)
        
        loadVaultItems()

        findViewById<Button>(R.id.btnImport).setOnClickListener {
            val intent = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
            startActivityForResult(intent, PICK_IMAGE)
        }
    }

    private fun loadVaultItems() {
        val vaultDir = File(filesDir, "vault")
        if (!vaultDir.exists()) vaultDir.mkdirs()
        val files = vaultDir.listFiles()
        // Update adapter with files
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode == Activity.RESULT_OK && requestCode == PICK_IMAGE) {
            val imageUri: Uri? = data?.data
            imageUri?.let { importFile(it) }
        }
    }

    private fun importFile(uri: Uri) {
        val inputStream = contentResolver.openInputStream(uri)
        val vaultDir = File(filesDir, "vault")
        val fileName = "vault_${System.currentTimeMillis()}.jpg"
        val destFile = File(vaultDir, fileName)
        
        val outputStream = FileOutputStream(destFile)
        inputStream?.copyTo(outputStream)
        
        // Logic to delete original file (requires permissions/scoped storage)
        // contentResolver.delete(uri, null, null)
        
        loadVaultItems()
    }
}
